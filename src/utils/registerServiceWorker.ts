export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      // Add cache busting to service worker URL
      const deploymentId = window.location.search.includes('dpl=') ? 
        window.location.search.match(/dpl=([^&]+)/)?.[1] || Date.now() : 
        Date.now();
      const swUrl = `/sw.js?v=${deploymentId}&t=${Date.now()}`;

      // Check if we're in a production environment
      if (process.env.NODE_ENV === 'production' && typeof window !== 'undefined') {
        navigator.serviceWorker
          .register(swUrl)
          .then((registration) => {
            console.log('ServiceWorker registration successful');

            // Check for updates every 5 minutes
            const updateInterval = setInterval(() => {
              registration.update();
            }, 5 * 60 * 1000);

            // Listen for updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New content is available, force update
                    newWorker.postMessage({ type: 'SKIP_WAITING' });
                    window.location.reload();
                  }
                });
              }
            });

            // Handle errors
            registration.addEventListener('error', (error) => {
              console.error('ServiceWorker error:', error);
              clearInterval(updateInterval);
            });
          })
          .catch((error) => {
            console.error('ServiceWorker registration failed:', error);
            // Don't fail the app if service worker registration fails
          });
      }
    });
  }
} 