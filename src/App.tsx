import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return <div className="min-h-screen bg-background" />;
}
