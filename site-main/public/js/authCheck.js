(async () => {
  const hasSession = typeof window.hasActiveSession === "function"
    ? await window.hasActiveSession()
    : !!localStorage.getItem("token");

  if (!hasSession) {
    navigate("/login");
  }
})();
