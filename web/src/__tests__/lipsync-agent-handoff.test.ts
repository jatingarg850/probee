/**
 * Tests for lipsync timing coordination during agent handoffs
 *
 * This test suite validates that:
 * 1. Lipsync doesn't start prematurely before TTS audio begins
 * 2. Lipsync properly stops during agent handoffs
 * 3. Multiple resets don't cause race conditions
 */

import { VisemeScheduler } from '@/lib/visemeScheduler'

describe('Lipsync Agent Handoff Coordination', () => {
  let scheduler: VisemeScheduler

  beforeEach(() => {
    scheduler = new VisemeScheduler()
  })

  describe('Startup Delay', () => {
    it('should not return viseme immediately after pushWord', () => {
      scheduler.pushWord('hello')

      // Should be null during delay period
      expect(scheduler.peek()).toBeNull()
      expect(scheduler.advance(0)).toBeNull()
    })

    it('should start returning visemes after delay period', () => {
      scheduler.pushWord('hello')

      // Advance through the delay period
      const viseme1 = scheduler.advance(100) // Partial delay
      expect(viseme1).toBeNull()

      const viseme2 = scheduler.advance(150) // Complete delay + overflow
      expect(viseme2).not.toBeNull()
    })

    it('should handle multiple words during delay', () => {
      scheduler.pushWord('hello')
      scheduler.pushWord('world')

      // Should still be in delay
      expect(scheduler.peek()).toBeNull()

      // Complete delay
      const viseme = scheduler.advance(250)
      expect(viseme).not.toBeNull()
      expect(scheduler.hasPending()).toBe(true)
    })
  })

  describe('Reset Behavior', () => {
    it('should clear delay state on reset', () => {
      scheduler.pushWord('hello')
      scheduler.advance(100) // Partial delay

      scheduler.reset()

      expect(scheduler.peek()).toBeNull()
      expect(scheduler.hasPending()).toBe(false)
    })

    it('should start fresh delay after reset and new word', () => {
      scheduler.pushWord('hello')
      scheduler.advance(100) // Partial delay
      scheduler.reset()

      scheduler.pushWord('world')

      // Should be in delay again
      expect(scheduler.peek()).toBeNull()
      expect(scheduler.hasPending()).toBe(true)
    })
  })

  describe('Timing Coordination', () => {
    it('should handle rapid reset calls without errors', () => {
      scheduler.pushWord('hello')

      // Simulate multiple rapid resets (like during handoff)
      scheduler.reset()
      scheduler.reset()
      scheduler.reset()

      // Should still work normally
      scheduler.pushWord('world')
      expect(scheduler.hasPending()).toBe(true)
    })

    it('should properly calculate pending time including delay', () => {
      scheduler.pushWord('hello') // Estimated ~474ms word

      const pendingBefore = scheduler.pendingMs()
      expect(pendingBefore).toBeGreaterThan(200) // Should include delay

      scheduler.advance(100) // Partial delay
      const pendingAfter = scheduler.pendingMs()
      expect(pendingAfter).toBeLessThan(pendingBefore)
    })
  })

  describe('Edge Cases', () => {
    it('should handle empty words gracefully', () => {
      scheduler.pushWord('')
      expect(scheduler.peek()).toBeNull()
      expect(scheduler.hasPending()).toBe(false)
    })

    it('should handle advance with zero deltaMs', () => {
      scheduler.pushWord('hello')
      scheduler.advance(250) // Complete delay

      const viseme1 = scheduler.advance(0)
      const viseme2 = scheduler.advance(0)

      // Should be same viseme without advancement
      expect(viseme1).toBe(viseme2)
    })
  })
})
