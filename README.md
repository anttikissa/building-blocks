# Building blocks

Small TypeScript modules with no dependencies, for Bun. Each block is one
file. To use one, copy it into your project and note the commit it came from.

| File | What it does |
| --- | --- |
| `ason.ts` | ASON: JSON a person can read and write. Comments, trailing commas, unquoted keys, JS numbers. |
| `live-file.ts` | A plain object backed by a small `.ason` file: atomic writes, reloads on external edits. Needs `ason.ts`. |
| `tail-file.ts` | Follows a growing file as a byte stream. |
| `tid.ts` | Short ids that sort by creation time, and unguessable secrets. Both carry at most 128 bits. |
| `log.ts` | One timestamped line per event on stdout, plus one file per day if you want it. Needs `ason.ts`. |
| `validate.ts` | Typed parsing of env and config files, URL parameters and request bodies, in the style of zod. |
| `qr.ts` | QR codes, byte mode, level M, versions 1-40: text in, module matrix and SVG path out. |

## Develop

    bun install
    ./test        # types and tests
    bunx oxfmt    # format

MIT license.
