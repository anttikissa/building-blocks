// Parses untrusted input into typed values: env and config files, URL parameters, request bodies.
// Env files and URLs hold only strings, so numbers and booleans also accept their string forms, and
// an empty string counts as missing (KEY= in an env file). parse() throws one error that lists every
// bad field by path. Messages never quote values: they may be secrets.
//
//   const Env = v.object({ PORT: v.int().min(1).max(65535).default(4710), ADMIN: v.email().optional() })
//   const env = Env.parse(input)   // also takes URLSearchParams
//   type Env = Infer<typeof Env>

type Check<T> = (value: unknown, path: string, errors: string[]) => T

export class Schema<T> {
	constructor(readonly check: Check<T>) {}

	parse(input: unknown): T {
		const errors: string[] = []
		const value = this.check(input, '', errors)
		if (errors.length) throw new Error(errors.join('\n'))
		return value
	}

	refine(ok: (value: T) => boolean, message: string): Schema<T> {
		return new Schema((value, path, errors) => {
			const before = errors.length
			const result = this.check(value, path, errors)
			if (errors.length === before && !ok(result)) errors.push(`${path || 'value'}: ${message}`)
			return result
		})
	}

	// A number's value; a string's or an array's length.
	min(n: number) {
		return this.refine((x) => size(x) >= n, `must be at least ${n}`)
	}

	max(n: number) {
		return this.refine((x) => size(x) <= n, `must be at most ${n}`)
	}

	optional(): Schema<T | undefined> {
		return new Schema((value, path, errors) => (missing(value) ? undefined : this.check(value, path, errors)))
	}

	default(fallback: T): Schema<T> {
		return new Schema((value, path, errors) => (missing(value) ? fallback : this.check(value, path, errors)))
	}
}

export type Infer<S> = S extends Schema<infer T> ? T : never

const missing = (x: unknown) => x === undefined || x === ''
const size = (x: unknown) => (typeof x === 'number' ? x : (x as { length: number }).length)
const num = (x: unknown) => (typeof x === 'number' ? x : typeof x === 'string' && x.trim() ? Number(x) : NaN)

// Records why `value` is unusable and returns nothing; callers pass the result on as T.
function fail(value: unknown, path: string, errors: string[], expected: string): never {
	errors.push(`${path || 'value'}: ${missing(value) ? 'required' : `expected ${expected}`}`)
	return undefined as never
}

// A schema that converts a value, or returns undefined if it cannot.
function scalar<T>(expected: string, convert: (x: unknown) => T | undefined): Schema<T> {
	return new Schema((value, path, errors) => {
		const result = missing(value) ? undefined : convert(value)
		return result === undefined ? fail(value, path, errors, expected) : result
	})
}

const text = (x: unknown) => (typeof x === 'string' ? x : undefined)

function array<T>(item: Schema<T>): Schema<T[]> {
	return new Schema((value, path, errors) =>
		Array.isArray(value)
			? value.map((x, i) => item.check(x, `${path}[${i}]`, errors))
			: fail(value, path, errors, 'an array'),
	)
}

// Keeps only the keys in `shape`.
function object<S extends Record<string, Schema<unknown>>>(shape: S): Schema<{ [K in keyof S]: Infer<S[K]> }> {
	return new Schema((value, path, errors) => {
		if (value instanceof URLSearchParams) value = Object.fromEntries(value)
		if (!value || typeof value !== 'object' || Array.isArray(value)) return fail(value, path, errors, 'an object')
		const out: Record<string, unknown> = {}
		for (const key in shape)
			out[key] = shape[key]!.check((value as Record<string, unknown>)[key], path ? `${path}.${key}` : key, errors)
		return out as { [K in keyof S]: Infer<S[K]> }
	})
}

export const v = {
	string: () => scalar('a string', text),
	number: () => scalar('a number', (x) => (Number.isFinite(num(x)) ? num(x) : undefined)),
	int: () => scalar('an integer', (x) => (Number.isSafeInteger(num(x)) ? num(x) : undefined)),
	boolean: () =>
		scalar('true or false', (x) =>
			x === true || x === 'true' || x === '1' ? true : x === false || x === 'false' || x === '0' ? false : undefined,
		),
	// Looks like an address: no spaces, one @, a dot in the domain.
	email: () =>
		scalar('an email address', (x) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(x) ?? '') ? text(x) : undefined)).max(
			254,
		),
	url: () => scalar('a URL', (x) => (URL.canParse(text(x) ?? '') ? text(x) : undefined)),
	oneOf: <const T extends string[]>(...values: T) =>
		scalar(`one of ${values.join(', ')}`, (x) => (values.includes(x as string) ? (x as T[number]) : undefined)),
	array,
	object,
}
