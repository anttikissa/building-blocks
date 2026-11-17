import { expect, test } from 'bun:test'
import { tid, tidAt, tidTime } from './tid'

test('ids sort by creation time and give it back', () => {
	const ids = Array.from({ length: 100 }, () => tid('t'))
	expect([...ids].sort()).toEqual(ids)
	expect(new Set(ids).size).toBe(100)
	expect(tidAt('t', 1_700_000_000_000)).toMatch(/^t[0-9a-z]{11}$/)
	expect(tidTime(tidAt('t', 1_700_000_000_000, 4))).toBe(1_700_000_000_000)
})
