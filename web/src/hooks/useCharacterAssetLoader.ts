'use client'

import { PANEL_AVATARS, PANEL_AVATAR_ORDER } from '@/lib/panelAvatars'
import { useGLTF } from '@react-three/drei'
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'

export interface CharacterAssetLoadingState {
  isLoading: boolean
  isReady: boolean
  progress: number // 0-1
  loadedModels: Set<string>
  errors: Map<string, Error>
}

// Access THREE's built-in cache manager for GLTFLoader
const getGLTFCache = () => {
  return (THREE.Cache?.files as Record<string, any>) || {}
}

/**
 * Hook to manage loading and tracking of all 3D character assets.
 *
 * Returns a state object with:
 * - isLoading: true while any models are still loading
 * - isReady: true when all models have successfully loaded
 * - progress: number from 0-1 indicating overall progress
 * - loadedModels: Set of URLs that have been successfully loaded
 * - errors: Map of URL -> Error for any failed loads
 *
 * This hook triggers the actual preloading of models via useGLTF.preload()
 * and waits for them to complete before marking ready.
 */
export function useCharacterAssetLoader() {
  const [state, setState] = useState<CharacterAssetLoadingState>({
    isLoading: true,
    isReady: false,
    progress: 0,
    loadedModels: new Set(),
    errors: new Map(),
  })

  const loadedCountRef = useRef(0)
  const totalModelsRef = useRef(0)
  const loadedModelsRef = useRef(new Set<string>())
  const errorsRef = useRef(new Map<string, Error>())
  const checkIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    // Enable THREE caching
    THREE.Cache.enabled = true

    // Reset state on mount
    loadedCountRef.current = 0
    loadedModelsRef.current.clear()
    errorsRef.current.clear()

    const modelUrls = PANEL_AVATAR_ORDER.map((id) => PANEL_AVATARS[id].modelUrl)
    const uniqueUrls = Array.from(new Set(modelUrls))

    // If no unique URLs (shouldn't happen), mark as ready immediately
    if (uniqueUrls.length === 0) {
      setState({
        isLoading: false,
        isReady: true,
        progress: 1,
        loadedModels: new Set(),
        errors: new Map(),
      })
      return
    }

    totalModelsRef.current = uniqueUrls.length
    let cancelled = false
    let attemptCount = 0
    const maxAttempts = 60 // 3 seconds at 50ms intervals

    // Start preloading all models
    uniqueUrls.forEach((url) => {
      try {
        useGLTF.preload(url)
      } catch (error) {
        console.error('Error preloading model:', url, error)
        errorsRef.current.set(url, error instanceof Error ? error : new Error(String(error)))
      }
    })

    // Poll to check if models are in the cache
    checkIntervalRef.current = setInterval(() => {
      if (cancelled) return

      attemptCount++
      const cache = getGLTFCache()

      for (const url of uniqueUrls) {
        if (loadedModelsRef.current.has(url)) {
          continue // Already counted as loaded
        }

        try {
          // Check if the model is in THREE's cache
          // useGLTF preload stores models with their URL as the cache key
          if (cache[url]) {
            loadedModelsRef.current.add(url)
            loadedCountRef.current += 1
          }
        } catch {
          // Model not yet in cache
        }
      }

      // Update progress
      const progress = Math.min(1, loadedCountRef.current / totalModelsRef.current)
      const isReady = loadedCountRef.current === totalModelsRef.current

      setState({
        isLoading: !isReady,
        isReady,
        progress,
        loadedModels: new Set(loadedModelsRef.current),
        errors: new Map(errorsRef.current),
      })

      // Stop polling if all loaded or max attempts reached
      if (isReady || attemptCount >= maxAttempts) {
        if (checkIntervalRef.current) {
          clearInterval(checkIntervalRef.current)
          checkIntervalRef.current = null
        }

        // If we hit max attempts but not all loaded, still mark as ready
        // to prevent UI from getting stuck
        if (attemptCount >= maxAttempts && !isReady) {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            isReady: true,
            progress: 1,
          }))
        }
      }
    }, 50) // Check every 50ms

    return () => {
      cancelled = true
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current)
        checkIntervalRef.current = null
      }
    }
  }, [])

  return state
}
