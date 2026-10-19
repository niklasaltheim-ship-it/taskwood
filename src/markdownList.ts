import { parseTask } from "./dates";
import { uid } from "./data";
import type { Data, Prio, Project, Repeat, Task } from "./data";
import { ANIMALS } from "./sprites";

// Aufgabenlisten im Markdown-Format übernehmen (eingefügt oder als .md/.txt-Datei):
// "# Name" = Projekt, "- [ ] Text" = Aufgabe, eingerückt = Unteraufgabe, "- [x]" = schon erledigt.
// Datum, Priorität und Wiederholung im Text erkennt parseTask wie bei der normalen Eingabe.
// Ohne Kästchen gehen auch einfache Spiegelstriche und nummerierte Listen.

export type ListItem = { text: string; due?: string; prio?: Prio; repeat?: Repeat; done: boolean; note?: string; subs: ListItem[] };
export type ListGroup = { heading: string | null; items: ListItem[] }; // heading null = ohne Überschrift
export type ParsedList = { groups: ListGroup[]; count: number; skipped: number }; // skipped: Textzeilen ohne Aufgabe

const HEADING = /^ {0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/;
const ITEM = /^(\s*)(?:[-*+•]|\d{1,3}[.)])\s+(?:\[([ xX])\](?:\s+|$))?(.*)$/;
const CHECKBOX = /^\s*(?:[-*+•]|\d{1,3}[.)])\s+\[[ xX]\]/m;

const indentOf = (s: string) => s.replace(/\t/g, "    ").length;
export const normText = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

function item(raw: string, done: boolean): ListItem | null {
  const text = raw.trim();
  if (!text) return null;
  const { text: clean, due, prio, repeat } = parseTask(text);
  return { text: clean, due, prio, repeat, done, subs: [] };
}

export function parseList(src: string): ParsedList {
  const lines = src.replace(/^﻿/, "").split(/\r?\n/);
  // Ganz ohne Listenzeichen: jede Zeile ist eine Aufgabe (z. B. aus einer Notiz kopiert)
  const plain = !lines.some(l => ITEM.test(l));
  const groups: ListGroup[] = [];
  let group: ListGroup | null = null;
  let top: { item: ListItem; indent: number } | null = null;
  let last: { item: ListItem; indent: number } | null = null; // zuletzt gelesene Aufgabe, auch Unteraufgabe
  let count = 0;
  let skipped = 0;

  const groupFor = (heading: string | null) => {
    // Gleiche Überschrift mehrmals: eine Gruppe
    const g = groups.find(x => (x.heading === null ? heading === null : heading !== null && normText(x.heading) === normText(heading)));
    if (g) return g;
    const n: ListGroup = { heading, items: [] };
    groups.push(n);
    return n;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    const h = line.match(HEADING);
    if (h) {
      const name = h[1].replace(/[*_`]/g, "").trim();
      if (name) {
        group = groupFor(name);
        top = null;
        last = null;
      }
      continue;
    }
    const m = plain ? ([line, "", undefined, line] as const) : line.match(ITEM);
    if (!m) {
      // Eingerückte Zeile unter einer Aufgabe: Notiz zu der Aufgabe, unter der sie steht; sonst übersprungen
      const at = indentOf(line.match(/^\s*/)![0]);
      const owner = last && at > last.indent ? last.item : top && at > top.indent ? top.item : null;
      if (owner) owner.note = owner.note ? `${owner.note}\n${line.trim()}` : line.trim();
      else skipped++;
      continue;
    }
    const it = item(m[3], m[2] === "x" || m[2] === "X");
    if (!it) continue;
    group ??= groupFor(null);
    const indent = indentOf(m[1]);
    // Unteraufgaben gibt es nur eine Ebene tief: tiefer Eingerücktes hängt an der obersten Aufgabe
    if (top && indent > top.indent) top.item.subs.push(it);
    else {
      group.items.push(it);
      top = { item: it, indent };
    }
    last = { item: it, indent };
    count++;
  }
  // Erledigte Hauptaufgabe: ihre Unteraufgaben gelten ebenfalls als erledigt (wie beim Abhaken)
  for (const g of groups) for (const it of g.items) if (it.done) it.subs.forEach(s => (s.done = true));
  return { groups: groups.filter(g => g.items.length), count, skipped };
}

// Sieht eingefügter Text nach einer Aufgabenliste aus? (für Strg+V außerhalb von Eingabefeldern)
export const looksLikeList = (s: string) => CHECKBOX.test(s) || (/^ {0,3}#{1,6}\s+\S/m.test(s) && parseList(s).count > 0);

// ---------- Zuordnung und Übernahme ----------

export type Target = { kind: "project"; id: string } | { kind: "new"; name: string } | { kind: "skip" };
export type PlanEntry = { item: ListItem; dup?: Task; subs: { item: ListItem; dup?: Task }[] };
export type PlanGroup = { group: ListGroup; target: Target; entries: PlanEntry[] };

export const findProject = (projects: Project[], name: string) => projects.find(p => normText(p.name) === normText(name));

// Gleiche Aufgabe schon im Zielprojekt (offen oder erledigt)? Unteraufgaben zählen nur unter derselben Hauptaufgabe.
export function plan(groups: ListGroup[], targets: Target[], tasks: Task[]): PlanGroup[] {
  return groups.map((group, i) => {
    const target = targets[i] ?? { kind: "skip" };
    const pid = target.kind === "project" ? target.id : null;
    const entries = group.items.map(item => {
      // offene Aufgabe vor erledigter, damit neue Unteraufgaben sichtbar landen
      const same = pid ? tasks.filter(t => t.projectId === pid && !t.parentId && normText(t.text) === normText(item.text)) : [];
      const dup = same.find(t => !t.doneAt) ?? same[0];
      const subs = item.subs.map(s => ({
        item: s,
        dup: dup ? tasks.find(t => t.parentId === dup.id && normText(t.text) === normText(s.text)) : undefined,
      }));
      return { item, dup, subs };
    });
    return { group, target, entries };
  });
}

export const countDups = (p: PlanGroup[]) =>
  p.filter(g => g.target.kind !== "skip").reduce((n, g) => n + g.entries.reduce((m, e) => m + (e.dup ? 1 : 0) + e.subs.filter(s => s.dup).length, 0), 0);

// Neues Projekt: ein Tier, das es im Ordner noch nicht gibt
function freshAnimal(projects: Project[], folderId: string) {
  const used = new Set(projects.filter(p => p.folderId === folderId).map(p => p.animal));
  return (ANIMALS.find(a => !used.has(a.kind)) ?? ANIMALS[projects.length % ANIMALS.length]).kind;
}

export type Applied = { data: Data; added: number; skipped: number; created: number; firstProject?: string };

// skipDups: schon vorhandene Aufgaben auslassen; neue Unteraufgaben kommen dann an die vorhandene Hauptaufgabe
export function applyPlan(d: Data, groups: PlanGroup[], skipDups: boolean, now = Date.now()): Applied {
  const projects = [...d.projects];
  const tasks: Task[] = [];
  let order = d.tasks.reduce((m, t) => Math.max(m, t.order), 0);
  let added = 0;
  let skipped = 0;
  let created = 0;
  let firstProject: string | undefined;
  const newIds = new Map<string, string>(); // Name neuer Projekte -> id (zwei Gruppen, ein neues Projekt)

  const make = (it: ListItem, projectId: string, parent?: Task, parentDone?: boolean): Task => {
    const done = it.done || !!parentDone;
    const t: Task = {
      id: uid(),
      projectId,
      text: it.text,
      createdAt: now + added,
      order: ++order,
      ...(parent ? { parentId: parent.id } : {}),
      ...(it.due ? { due: it.due } : {}),
      ...(it.prio ? { prio: it.prio } : {}),
      ...(it.repeat ? { repeat: it.repeat } : {}),
      ...(it.note ? { note: it.note } : {}),
      ...(done ? { doneAt: now + added } : {}),
    };
    added++;
    tasks.push(t);
    return t;
  };

  for (const g of groups) {
    if (g.target.kind === "skip") continue;
    let pid: string;
    if (g.target.kind === "project") pid = g.target.id;
    else {
      const key = normText(g.target.name);
      pid = newIds.get(key) ?? "";
      if (!pid) {
        const p: Project = { id: uid(), folderId: d.activeFolder, name: g.target.name.trim(), animal: freshAnimal(projects, d.activeFolder) };
        projects.push(p);
        newIds.set(key, p.id);
        pid = p.id;
        created++;
      }
    }
    firstProject ??= pid;
    for (const e of g.entries) {
      let parent: Task;
      if (e.dup && skipDups) {
        parent = e.dup;
        skipped++;
      } else parent = make(e.item, pid);
      const parentDone = !!parent.doneAt;
      for (const s of e.subs) {
        if (s.dup && skipDups && parent === e.dup) skipped++;
        else make(s.item, pid, parent, parentDone);
      }
    }
  }
  return { data: { ...d, projects, tasks: [...d.tasks, ...tasks] }, added, skipped, created, firstProject };
}
