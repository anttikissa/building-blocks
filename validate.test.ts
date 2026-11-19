import { expect, test } from 'bun:test'
import { v, ValidationError, type Infer } from './validate'

const Env = v.object({
	PORT: v.int().min(1).max(65535).default(4710),
	RATIO: v.number(),
	NAME: v.string().optional(),
	ADMIN: v.email(),
	DEBUG: v.boolean().default(false),
	MODE: v.oneOf(['dev', 'prod']),
	HOME: v.url(),
	TAGS: v.array(v.string().min(1)).optional(),
	DB: v.object({ path: v.string() }).optional(),
})

test('converts strings from env files and URLs, applies defaults and drops unknown keys', () => {
	const env: Infer<typeof Env> = Env.parse({
		RATIO: '0.5',
		NAME: '',
		ADMIN: 'a@example.com',
		DEBUG: '1',
		MODE: 'prod',
		HOME: 'https://example.com/',
		SECRET: 'x',
	})
	expect(env).toEqual({
		PORT: 4710,
		RATIO: 0.5,
		NAME: undefined,
		ADMIN: 'a@example.com',
		DEBUG: true,
		MODE: 'prod',
		HOME: 'https://example.com/',
		TAGS: undefined,
		DB: undefined,
	})
	expect(v.object({ page: v.int(), q: v.string() }).parse(new URLSearchParams('page=2&q=hi'))).toEqual({
		page: 2,
		q: 'hi',
	})
	expect(v.object({ on: v.boolean() }).parse({ on: false })).toEqual({ on: false })
})

test('lists every bad field by path and never quotes values', () => {
	const error = (() => {
		try {
			Env.parse({
				PORT: '70000',
				RATIO: 'abc',
				ADMIN: 'hunter2',
				DEBUG: 'yes',
				MODE: 'test',
				HOME: 'not a url',
				TAGS: ['a', ''],
				DB: { path: 3 },
			})
		} catch (e) {
			return (e as Error).message
		}
	})()
	expect(error).toBe(
		[
			'PORT: must be at most 65535',
			'RATIO: expected a number',
			'ADMIN: expected an email address',
			'DEBUG: expected true or false',
			'MODE: expected one of dev, prod',
			'HOME: expected a URL',
			'TAGS[1]: required',
			'DB.path: expected a string',
		].join('\n'),
	)
	expect(() => Env.parse(undefined)).toThrow('value: required')
	expect(() => v.int().parse('1.5')).toThrow('value: expected an integer')
	expect(() => v.number().parse(' ')).toThrow('value: expected a number')
	expect(() => v.email().parse(`${'a'.repeat(250)}@b.cc`)).toThrow('value: must have at most 254 characters')
})

test('issues carry path, code and limit, with custom messages for forms', () => {
	const Signup = v.object({
		email: v.email('Check the email address.').transform((s) => s.toLowerCase()),
		password: v.string('Type a password.').min(8, 'Use at least 8 characters.'),
		name: v
			.string()
			.transform((s) => s.trim())
			.min(1),
	})
	expect(Signup.parse({ email: 'A@Example.com', password: '12345678', name: ' Ann ' })).toEqual({
		email: 'a@example.com',
		password: '12345678',
		name: 'Ann',
	})
	let error: unknown
	try {
		Signup.parse({ email: 'nope', password: 'short', name: '  ' })
	} catch (e) {
		error = e
	}
	expect(error).toBeInstanceOf(ValidationError)
	expect((error as ValidationError).issues).toEqual([
		{ path: 'email', code: 'type', message: 'Check the email address.' },
		{ path: 'password', code: 'min', limit: 8, message: 'Use at least 8 characters.' },
		{ path: 'name', code: 'min', limit: 1, message: 'must have at least 1 character' },
	])
	expect(() => Signup.parse({ name: 'x' })).toThrow('email: Check the email address.\npassword: Type a password.')
})

test('null counts as missing; nullable() gives null', () => {
	expect(v.string().optional().parse(null)).toBeUndefined()
	expect(v.string().nullable().parse(undefined)).toBeNull()
	expect(v.string().nullable().parse('a')).toBe('a')
	expect(() => v.string().parse(null)).toThrow('value: required')
})

test('union takes the first option that accepts the value', () => {
	const Price = v.union([v.string(), v.number()], 'Give a price.')
	expect(Price.parse(3)).toBe(3)
	expect(Price.parse('3')).toBe('3')
	expect(() => Price.parse(true)).toThrow('value: Give a price.')
	expect(() => v.union([v.int().min(1), v.oneOf(['all'])]).parse(0)).toThrow('value: expected a valid value')
})

test('issues without a limit have no limit key', () => {
	try {
		v.string()
			.refine((s) => s === 'x', 'not x')
			.parse('y')
	} catch (e) {
		expect(Object.keys((e as ValidationError).issues[0]!)).toEqual(['path', 'code', 'message'])
	}
})
