"""Erzeugt THIRD_PARTY_LICENSES.txt aus den tatsächlich ausgelieferten Abhängigkeiten.

Rust: alle Crates im Windows-Build (cargo tree, normale Abhängigkeiten).
npm:  nur Pakete, die zur Laufzeit im Frontend-Bundle landen.
Lizenztexte werden aus den Paketen gelesen; identische Texte erscheinen nur einmal.

Aufruf im Projektordner:  python scripts/third-party-licenses.py
"""

import glob
import hashlib
import json
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "THIRD_PARTY_LICENSES.txt")
NPM_RUNTIME = ["react", "react-dom", "scheduler", "@tauri-apps/api", "@tauri-apps/plugin-notification", "@tauri-apps/plugin-dialog", "@tauri-apps/plugin-global-shortcut", "@tauri-apps/plugin-autostart"]
LICENSE_FILE = re.compile(r"^(licen[cs]e|copying|copyright|notice)([-_.].*)?$", re.I)


def license_texts(folder):
    out = []
    for f in sorted(os.listdir(folder)):
        p = os.path.join(folder, f)
        if os.path.isfile(p) and LICENSE_FILE.match(f):
            out.append((f, open(p, encoding="utf-8", errors="replace").read().strip()))
    return out


def rust_packages():
    fmt = "{p}\t{l}\t{r}"
    res = subprocess.run(
        ["cargo", "tree", "--target", "x86_64-pc-windows-msvc", "-e", "normal", "--prefix", "none", "-f", fmt, "--offline"],
        cwd=os.path.join(ROOT, "src-tauri"), capture_output=True, text=True, encoding="utf-8", check=True,
    )
    regs = glob.glob(os.path.expanduser(os.path.join("~", ".cargo", "registry", "src", "*")))
    seen, pkgs = set(), []
    for line in res.stdout.splitlines():
        parts = line.replace(" (*)", "").split("\t")
        if len(parts) < 2:
            continue
        m = re.match(r"(\S+) v(\S+)", parts[0])
        if not m or "(" in parts[0] and "registry" not in parts[0] and "proc-macro" not in parts[0] and m.group(1) == "taskwood":
            continue
        name, ver = m.group(1), m.group(2)
        if name == "taskwood" or (name, ver) in seen:
            continue
        seen.add((name, ver))
        folder = next((os.path.join(r, f"{name}-{ver}") for r in regs if os.path.isdir(os.path.join(r, f"{name}-{ver}"))), None)
        pkgs.append({
            "name": name, "version": ver, "license": parts[1].strip() or "siehe Lizenzdatei",
            "source": (parts[2].strip() if len(parts) > 2 and parts[2].strip() else f"https://crates.io/crates/{name}"),
            "texts": license_texts(folder) if folder else [],
        })
    return sorted(pkgs, key=lambda p: (p["name"], p["version"]))


def npm_packages():
    pkgs = []
    for name in NPM_RUNTIME:
        folder = os.path.join(ROOT, "node_modules", *name.split("/"))
        d = json.load(open(os.path.join(folder, "package.json"), encoding="utf-8"))
        repo = d.get("repository")
        repo = repo.get("url") if isinstance(repo, dict) else repo
        pkgs.append({
            "name": name, "version": d["version"], "license": d.get("license", "siehe Lizenzdatei"),
            "source": (repo or f"https://www.npmjs.com/package/{name}").replace("git+", ""),
            "texts": license_texts(folder),
        })
    return pkgs


def main():
    rust, npm = rust_packages(), npm_packages()
    allp = [("Rust", p) for p in rust] + [("npm", p) for p in npm]
    groups = {}
    for kind, p in allp:
        for fname, text in p["texts"]:
            h = hashlib.sha1(text.encode()).hexdigest()
            groups.setdefault(h, {"text": text, "users": []})["users"].append(f'{p["name"]} {p["version"]}')
    mpl = [p for _, p in allp if "MPL" in p["license"]]

    L = []
    L.append("Taskwood – Lizenzen von Drittanbietern / Third-party licenses")
    L.append("=" * 64)
    L.append("")
    L.append("Taskwood selbst steht unter der MIT-Lizenz (siehe LICENSE).")
    L.append("Taskwood is licensed under the MIT License (see LICENSE).")
    L.append("")
    L.append("Die App enthält die folgenden Bibliotheken. Ihre Lizenzen und Copyright-Hinweise")
    L.append("sind unten vollständig wiedergegeben.")
    L.append("The app contains the following libraries. Their licenses and copyright notices are")
    L.append("reproduced in full below.")
    L.append("")
    if mpl:
        L.append("Hinweis zu MPL-2.0 / Note on MPL-2.0")
        L.append("-" * 36)
        L.append("Die folgenden Bibliotheken stehen unter der Mozilla Public License 2.0. Sie werden")
        L.append("unverändert verwendet; der Quellcode ist unter den angegebenen Adressen erhältlich.")
        L.append("The following libraries are licensed under the Mozilla Public License 2.0. They are")
        L.append("used unmodified; their source code is available at the addresses given.")
        for p in mpl:
            L.append(f'  {p["name"]} {p["version"]}: {p["source"]}')
        L.append("")
    L.append("Installer / installer")
    L.append("-" * 21)
    L.append("Der Installer wurde mit NSIS (Nullsoft Scriptable Install System) erstellt,")
    L.append("lizenziert unter der zlib/libpng-Lizenz: https://nsis.sourceforge.io/License")
    L.append("")
    for title, items in (("Rust-Bibliotheken / Rust crates", rust), ("JavaScript-Bibliotheken / JavaScript packages", npm)):
        L.append(title)
        L.append("-" * len(title))
        for p in items:
            L.append(f'  {p["name"]} {p["version"]}  —  {p["license"]}  —  {p["source"]}')
        L.append("")
    L.append("=" * 64)
    L.append("Lizenztexte / License texts")
    L.append("=" * 64)
    for g in groups.values():
        L.append("")
        L.append("Verwendet von / Used by: " + ", ".join(sorted(set(g["users"]))))
        L.append("-" * 64)
        L.append(g["text"])
    missing = [f'{p["name"]} {p["version"]}' for _, p in allp if not p["texts"]]
    if missing:
        L.append("")
        L.append("Diese Pakete enthalten keine eigene Lizenzdatei. Es gilt die in der Liste oben angegebene")
        L.append("Lizenz (Standardtexte siehe oben); Copyright-Hinweise stehen im jeweiligen Quell-Repository.")
        L.append("These packages ship without their own license file. The license declared in the list above")
        L.append("applies (standard texts above); copyright notices are in the respective source repository.")
        L.append("  " + ", ".join(missing))
    open(OUT, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
    print(f"{len(rust)} Rust-Crates, {len(npm)} npm-Pakete, {len(groups)} verschiedene Lizenztexte, "
          f"{len(missing)} ohne Lizenzdatei, MPL: {[p['name'] for p in mpl]}")
    print(f"{OUT}: {os.path.getsize(OUT) // 1024} KB")
    lic = {}
    for _, p in allp:
        lic[p["license"]] = lic.get(p["license"], 0) + 1
    for k, v in sorted(lic.items(), key=lambda x: -x[1]):
        print(f"  {v:4}  {k}")


if __name__ == "__main__":
    sys.exit(main())
