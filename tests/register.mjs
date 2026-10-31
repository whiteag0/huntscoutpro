// Installs the resolve hook in tests/ts-resolve.mjs (see that file).
import { register } from "node:module";

register("./ts-resolve.mjs", import.meta.url);
