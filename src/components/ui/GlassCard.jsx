import { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';

/**
 * GlassCard - Glassmorphism card component
 * Applies: Aesthetic-usability effect, Law of Similarity (consistent card patterns)
 */
const GlassCard = ({
  children,
  className = '',
  hover = true,
  glow = false,
  glowColor = 'accent',
  padding = 'p-6',
  onClick,
  delay = 0,
}) => {
  const cardRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { opacity: 0, y: 16, scale: 0.97 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 0.45,
          delay,
          ease: 'power2.out',
          onComplete: () => setIsVisible(true),
        }
      );
    }
  }, [delay]);

  const handleMouseEnter = () => {
    if (hover && cardRef.current) {
      gsap.to(cardRef.current, {
        scale: 1.015,
        y: -3,
        duration: 0.25,
        ease: 'power2.out',
      });
    }
  };

  const handleMouseLeave = () => {
    if (hover && cardRef.current) {
      gsap.to(cardRef.current, {
        scale: 1,
        y: 0,
        duration: 0.25,
        ease: 'power2.out',
      });
    }
  };

  const glowClasses = glow
    ? glowColor === 'success'
      ? 'glow-success'
      : 'glow-accent'
    : '';

  return (
    <div
      ref={cardRef}
      className={`glass-card ${padding} ${glowClasses} ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      style={{ opacity: 0 }}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
    </div>
  );
};

export default GlassCard;
