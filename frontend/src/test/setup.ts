import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
  // Testes com ambiente Node (ex.: middleware do Vercel) não têm localStorage.
  if (typeof localStorage !== 'undefined') localStorage.clear()
})
