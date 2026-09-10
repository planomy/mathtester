import type { Test } from '../types'

export type ActiveTestBundle = {
  test: Test
  teacherEmail: string
  teacherName: string
}

const KEY = 'mathtester-active-test'

export function saveActiveTest(bundle: ActiveTestBundle) {
  sessionStorage.setItem(KEY, JSON.stringify(bundle))
}

export function loadActiveTest(): ActiveTestBundle | null {
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    return JSON.parse(raw) as ActiveTestBundle
  } catch {
    return null
  }
}
