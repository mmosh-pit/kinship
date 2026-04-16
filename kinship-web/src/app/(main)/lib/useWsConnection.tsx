import React from "react";

const useWsConnection = ({ isAuth }: { isAuth: boolean }) => {
  const connected = React.useRef(false);

  const [conn, setConn] = React.useState<WebSocket | null>(null);

  const connect = () => {
    if (conn) {
      return;
    }
    console.log("Connecting...");
    const url = process.env.NEXT_PUBLIC_BACKEND_URL!;
    const token = window.localStorage.getItem("token");

    const connection = new WebSocket(
      `${url.replace("http", "ws").replace("https", "wss")}/chat?token=${token}`,
    );

    connection.onopen = () => {
      console.log(`Socket.IO connected to ${url}`);
      setConn(connection);
    };

    connection.onclose = () => {
      console.log(`Socket.IO disconnected from ${url}`);
      setConn(null);

      connected.current = false;

      setTimeout(() => {
        connect();
      }, 5000);
    };

    connection.onerror = (err) => {
      console.error(`Socket.IO connection error to ${url}:`, err);
      setConn(null);
      connected.current = false;

      setTimeout(() => {
        connect();
      }, 5000);
    };
  };

  const disconnect = () => {
    if (conn) {
      conn.close();
      setConn(null);
    }
  };

  React.useEffect(() => {
    if (connected.current) return;
    if (isAuth) {
      connected.current = true;
      connect();
    } else {
      disconnect();
    }
  }, [isAuth]);

  return conn;
};

export default useWsConnection;
