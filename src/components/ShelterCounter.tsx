'use client';

import { useEffect, useState } from 'react';

interface ShelterCounterProps {
  targetNumber: number;
  version: string;
}

export default function ShelterCounter({ targetNumber, version }: ShelterCounterProps) {
  const [count, setCount] = useState(targetNumber);
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
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
  }, [targetNumber]);

  return (
    <div className="text-center mt-8">
      <div className="text-2xl sm:text-3xl font-bold text-[#F97316]">
        {isClient ? count.toLocaleString('da-DK') : targetNumber.toLocaleString('da-DK')}
      </div>
      <div className="text-sm sm:text-base text-[#E5E7EB] mt-2">
        sikringspladser i databasen
      </div>
    </div>
  );
} 