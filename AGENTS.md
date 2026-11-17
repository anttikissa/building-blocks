# Building blocks

Small, dependency-free TypeScript modules that projects copy in, one
file each. A block has a test file beside it when it has tests.

## Code

Climb the lazy ladder: skip code that need not exist; prefer the
standard library, native platform features (Bun, Web APIs), one line,
then the minimum code that works. Never cut trust-boundary validation,
data-loss handling, security or explicit requirements.

No runtime dependencies. A block may import another block; say so in
README.md.

Every block is a library that other projects copy, so keep it free of
project details: no config imports, no app names, no paths.

Avoid defensive, just-in-case code. Rate how often each case occurs:
always, often, sometimes, rarely, almost never or practically never.
For a case rated "rarely" or below, ask the user whether to handle it
before you write code for it.

Ids come from tid(), secrets from secretId(). Never use randomUUID or
a hand-written random string. Raw random bytes are only for crypto
keys, IVs, salts and protocol fields.

Start each source file with a comment that says why the module exists.

Stack: Bun, TypeScript. Format with `bunx oxfmt`. Typecheck with
`bun check`.

## Tests

`./test` runs `bun check` beside `bun test --parallel`; run it for
every change. Blocks are libraries, so they keep full suites. Tests
never use the network. Delete a flaky test; never retry it, lengthen
its timeout or skip it. Test behavior, not source text.

## Git

Wrap commit messages at 72 columns. End with these trailers:

    Implemented by: <model id>
    Session: <session id>

Keep in sync with GitHub: after every commit, run `git pull --rebase`
and then `git push`.

The repository is public. Never write a private host name or a path on
someone's machine (a home folder, a checkout) into a file, a commit or
a commit message. Use example.com in examples.
