import React from 'react';

interface DefaultAvatarProps {
  size?: number;
  className?: string;
}

const DefaultAvatar: React.FC<DefaultAvatarProps> = ({ size = 40, className = "" }) => {
  return (
    <div 
      className={`bg-gradient-to-br from-purple-500 to-pink-500 rounded-full flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg 
        width={size * 0.6} 
        height={size * 0.6} 
        viewBox="0 0 24 24" 
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        <path 
          d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" 
          fill="white"
        />
        <path 
          d="M12 14C8.13401 14 5 17.134 5 21C5 21.5523 5.44772 22 6 22H18C18.5523 22 19 21.5523 19 21C19 17.134 15.866 14 12 14Z" 
          fill="white"
        />
      </svg>
    </div>
  );
};

export default DefaultAvatar; 