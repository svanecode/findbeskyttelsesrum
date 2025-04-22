'use client';

import { useEffect } from 'react';
import { registerServiceWorker } from '@/utils/registerServiceWorker';

export default function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') {
      registerServiceWorker();
    }
  }, []);

  return null;
} 