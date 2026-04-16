import React, { useState } from 'react';
import Image from 'next/image';
import DefaultAvatar from './DefaultAvatar';

interface AvatarProps {
  src?: string;
  alt?: string;
  size?: number;
  className?: string;
}

const Avatar: React.FC<AvatarProps> = ({ 
  src, 
  alt = "Avatar", 
  size = 40, 
  className = "" 
}) => {
  const [imageError, setImageError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  // Show default avatar if no src or image failed to load
  if (!src || imageError) {
    return <DefaultAvatar size={size} className={className} />;
  }

  return (
    <div 
      className={`relative overflow-hidden rounded-full ${className}`}
      style={{ width: size, height: size }}
    >
      {isLoading && (
        <div className="absolute inset-0 bg-gray-200 animate-pulse rounded-full" />
      )}
      <Image
        src={src}
        alt={alt}
        fill
        className="rounded-full object-cover"
        onError={() => {
          setImageError(true);
          setIsLoading(false);
        }}
        onLoad={() => setIsLoading(false)}
        sizes="(max-width: 768px) 40px, 50px"
      />
    </div>
  );
};

export default Avatar; 