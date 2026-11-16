
import { FAMILIES, CATEGORY_MULTIPLE, UNKNOWN_MULTIPLE, MODEL } from './lib/model.ts';
const out = { families: FAMILIES, multiples: CATEGORY_MULTIPLE, unknown: UNKNOWN_MULTIPLE, model: MODEL };
console.log(JSON.stringify(out));
