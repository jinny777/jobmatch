import { StrictMode, Component } from "react";
import { createRoot } from "react-dom/client";
import MidCareerApp from "./MidCareerApp.jsx";

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, fontFamily: "sans-serif", color: "#dc2626" }}>
          <h2>⚠️ 오류가 발생했습니다</h2>
          <pre style={{ background: "#fef2f2", padding: 16, borderRadius: 8, fontSize: 13, whiteSpace: "pre-wrap" }}>
            {this.state.error.message}
            {"\n\n"}
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            style={{ marginTop: 16, padding: "8px 16px", background: "#dc2626", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
          >
            초기화 후 재시작
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ErrorBoundary>
      <MidCareerApp />
    </ErrorBoundary>
  </StrictMode>
);
