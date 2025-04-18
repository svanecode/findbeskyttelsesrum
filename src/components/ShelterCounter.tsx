'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

interface ShelterCounterProps {
  targetNumber: number;
}

export default function ShelterCounter({ targetNumber }: ShelterCounterProps) {
  // Initialize with target number to ensure consistent server/client rendering
  const [count, setCount] = useState(targetNumber);
  const [hasAnimated, setHasAnimated] = useState(false);

  useEffect(() => {
    // Only run animation on client side
    if (typeof window === 'undefined') return;

    if (!hasAnimated) {
      setHasAnimated(true);
      return;
    }

    // Reset count to 0 before animation
    setCount(0);
    
    const duration = 2000; // 2 seconds
    const steps = 60;
    const increment = targetNumber / steps;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      setCount(Math.min(Math.floor(increment * currentStep), targetNumber));

      if (currentStep >= steps) {
        clearInterval(timer);
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [targetNumber, hasAnimated]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.8 }}
      className="text-center mt-8"
    >
      <div className="text-2xl sm:text-3xl font-bold text-[#F97316]">
        {count.toLocaleString('da-DK')}
      </div>
      <div className="text-sm sm:text-base text-[#E5E7EB] mt-2">
        sikringspladser i databasen
      </div>
    </motion.div>
  );
} 