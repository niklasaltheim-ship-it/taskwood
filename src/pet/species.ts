import type { AnimalKind } from "../sprites";
import BEAVER from "./beaver";
import FOX from "./fox";
import HEDGEHOG from "./hedgehog";
import OWL from "./owl";
import RABBIT from "./rabbit";
import RACCOON from "./raccoon";
import SQUIRREL from "./squirrel";
import type { Species } from "./types";

export const SPECIES: Record<AnimalKind, Species> = {
  beaver: BEAVER,
  fox: FOX,
  squirrel: SQUIRREL,
  raccoon: RACCOON,
  hedgehog: HEDGEHOG,
  owl: OWL,
  rabbit: RABBIT,
};
