export function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = '/sw.js';

      // Check if we're in a production environment
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker
          .register(swUrl)
          .then((registration) => {
            console.log('ServiceWorker registration successful');

            // Check for updates every hour
            const updateInterval = setInterval(() => {
              registration.update();
            }, 60 * 60 * 1000);

            // Listen for updates
            registration.addEventListener('updatefound', () => {
              const newWorker = registration.installing;
              if (newWorker) {
                newWorker.addEventListener('statechange', () => {
                  if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    // New content is available, show a message to the user
                    if (window.confirm('A new version is available! Would you like to update?')) {
                      window.location.reload();
                    }
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
          });
      }
    });
  }
} 