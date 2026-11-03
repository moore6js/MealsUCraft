import { useEffect, useState } from "react";

function App() {
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    fetch("/api/health")
      .then((response) => response.json())
      .then((data) => setMessage(data.message))
      .catch(() => setMessage("Unable to connect to the server."));
  }, []);

  return (
    <main>
      <h1>React + Node</h1>
      <p>{message}</p>
    </main>
  );
}

export default App;
