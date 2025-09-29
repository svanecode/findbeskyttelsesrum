'use client'

interface ScriptConfig {
  src: string
  id?: string
  async?: boolean
  defer?: boolean
  onLoad?: () => void
  onError?: (error: Event) => void
  timeout?: number
  retries?: number
}

interface LoadedScript {
  id: string
  loaded: boolean
  error?: Error
}

class ScriptLoader {
  private loadedScripts = new Map<string, LoadedScript>()
  private loadingPromises = new Map<string, Promise<void>>()

  async loadScript(config: ScriptConfig): Promise<void> {
    const {
      src,
      id = this.generateId(src),
      async = true,
      defer = false,
      onLoad,
      onError,
      timeout = 10000,
      retries = 3
    } = config

    // Return existing promise if already loading
    if (this.loadingPromises.has(id)) {
      return this.loadingPromises.get(id)!
    }

    // Return immediately if already loaded
    if (this.loadedScripts.has(id) && this.loadedScripts.get(id)!.loaded) {
      onLoad?.()
      return Promise.resolve()
    }

    const loadPromise = this.loadWithRetry({
      src,
      id,
      async,
      defer,
      onLoad,
      onError,
      timeout,
      retries
    })

    this.loadingPromises.set(id, loadPromise)
    return loadPromise
  }

  private async loadWithRetry(config: ScriptConfig): Promise<void> {
    const { src, id = this.generateId(src), retries = 3, timeout = 10000 } = config
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        await this.loadSingleScript(config, timeout)
        this.loadedScripts.set(id, { 
          id, 
          loaded: true,
          loadedAt: Date.now() 
        } as any)
        config.onLoad?.()
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Script load failed')
        console.warn(`Script load attempt ${attempt}/${retries} failed for ${src}:`, lastError)
        
        if (attempt < retries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = Math.pow(2, attempt - 1) * 1000
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }

    // All retries failed
    this.loadedScripts.set(id, { id, loaded: false, error: lastError! })
    config.onError?.(new Event('error'))
    throw lastError
  }

  private loadSingleScript(config: ScriptConfig, timeout: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const { src, id = this.generateId(src), async = true, defer = false, onLoad, onError } = config

      // Check if script already exists
      const existingScript = document.getElementById(id) as HTMLScriptElement
      if (existingScript) {
        if (existingScript.src === src) {
          onLoad?.()
          resolve()
          return
        } else {
          existingScript.remove()
        }
      }

      const script = document.createElement('script')
      script.id = id
      script.src = this.addCacheBuster(src)
      script.async = async
      script.defer = defer

      const timeoutId = setTimeout(() => {
        script.remove()
        reject(new Error(`Script load timeout after ${timeout}ms: ${src}`))
      }, timeout)

      script.onload = () => {
        clearTimeout(timeoutId)
        onLoad?.()
        resolve()
      }

      script.onerror = (error) => {
        clearTimeout(timeoutId)
        script.remove()
        const errorEvent = error instanceof Event ? error : new Event('error')
        onError?.(errorEvent)
        reject(new Error(`Script load error: ${src}`))
      }

      document.head.appendChild(script)
    })
  }

  private addCacheBuster(src: string): string {
    // Use NUCLEAR cache busting strategy for maximum effect
    const { nuclearCacheBuster } = require('./cacheBuster')
    return nuclearCacheBuster(src)
  }

  private generateId(src: string): string {
    // Create a consistent ID from the src
    return `script-${btoa(src).replace(/[^a-zA-Z0-9]/g, '')}`
  }

  isLoaded(id: string): boolean {
    return this.loadedScripts.get(id)?.loaded || false
  }

  getError(id: string): Error | undefined {
    return this.loadedScripts.get(id)?.error
  }

  clearCache(): void {
    this.loadedScripts.clear()
    this.loadingPromises.clear()
  }

  // Clear specific script from cache
  clearScript(id: string): void {
    this.loadedScripts.delete(id)
    this.loadingPromises.delete(id)
    
    // Remove script element from DOM
    const scriptElement = document.getElementById(id) as HTMLScriptElement
    if (scriptElement) {
      scriptElement.remove()
    }
  }

  // Check if script needs to be reloaded (e.g., after navigation)
  needsReload(id: string, maxAge: number = 300000): boolean { // 5 minutes default
    const script = this.loadedScripts.get(id)
    if (!script || !script.loaded) return true
    
    // Check if script is older than maxAge
    const now = Date.now()
    const scriptAge = now - (script as any).loadedAt
    return scriptAge > maxAge
  }

  // Force reload a specific script
  async forceReloadScript(config: ScriptConfig): Promise<void> {
    const { id = this.generateId(config.src) } = config
    
    // Clear existing script
    this.clearScript(id)
    
    // Reload with fresh cache buster
    return this.loadScript({
      ...config,
      id,
      // Force fresh cache buster
      src: this.addCacheBuster(config.src)
    })
  }
}

// Singleton instance
export const scriptLoader = new ScriptLoader()

// Convenience function for loading multiple scripts in sequence
export async function loadScriptsSequentially(scripts: ScriptConfig[]): Promise<void> {
  for (const script of scripts) {
    await scriptLoader.loadScript(script)
  }
}

// Convenience function for loading scripts in parallel
export async function loadScriptsParallel(scripts: ScriptConfig[]): Promise<void> {
  await Promise.all(scripts.map(script => scriptLoader.loadScript(script)))
}
