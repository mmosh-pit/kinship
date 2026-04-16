"use client";
import React from "react";

const useCheckDeviceScreenSize = () => {
  const [width, setWidth] = React.useState(() => {
    // Check if window is available (client-side)
    if (typeof window !== 'undefined') {
      return window.innerWidth;
    }
    // Default value for server-side rendering
    return 1024;
  });

  const handleWindowSizeChange = () => {
    if (typeof window !== 'undefined') {
      setWidth(window.innerWidth);
    }
  };

  React.useEffect(() => {
    // Only add event listener on client-side
    if (typeof window !== 'undefined') {
      window.addEventListener("resize", handleWindowSizeChange);
      return () => {
        window.removeEventListener("resize", handleWindowSizeChange);
      };
    }
  }, []);

  return width;
};

export default useCheckDeviceScreenSize;
