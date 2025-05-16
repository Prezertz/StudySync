import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import "./Auth.css";

const Auth = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const signUp = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signUp({ email, password });

    if (error) {
      setError(error.message);
    } else {
      navigate("/username");
    }
    setLoading(false);
  };

  const signIn = async () => {
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setError(error.message);
    } else {
      navigate("/dashboard");
    }
    setLoading(false);
  };

  return (
    <div className="page-center">
      <div className="auth-container">
        <h2 className="auth-title"> Authentication</h2>
        {error && <p className="error-message">{error}</p>}
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="auth-input"
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="auth-input"
        />
        <button
          onClick={signUp}
          disabled={loading}
          className="auth-button signup-button"
        >
          {loading ? "Signing Up..." : "Sign Up"}
        </button>
        <button
          onClick={signIn}
          disabled={loading}
          className="auth-button signin-button"
        >
          {loading ? "Signing In..." : "Sign In"}
        </button>
      </div>
    </div>
  );
};

export default Auth;
