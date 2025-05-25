import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";

const Username = () => {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  // Get current user on mount
  const [userId, setUserId] = useState(null);
  useEffect(() => {
    const getUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();

      if (error || !user) {
        setError("User not authenticated");
        return;
      }
      setUserId(user.id);
    };
    getUser();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Username cannot be empty");
      return;
    }
    setLoading(true);
    setError(null);

    // Insert profile with username and user ID
    const { error: insertError } = await supabase
      .from("profiles")
      .insert([{ id: userId, username: username.trim() }]);

    if (insertError) {
      // Handle unique constraint or other DB errors
      setError("Failed to save username: " + insertError.message);
      setLoading(false);
      return;
    }

    // Success, navigate to dashboard
    navigate("/dashboard");
  };

  if (!userId) {
    // Still loading user or error occurred
    return <div className="page-center">{error ? error : "Loading..."}</div>;
  }

  return (
    <div className="page-center">
      <form onSubmit={handleSubmit} className="auth-container">
        <h2 className="auth-title">Choose a Username</h2>
        {error && <p className="error-message">{error}</p>}
        <input
          type="text"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="auth-input"
          disabled={loading}
        />
        <button type="submit" disabled={loading} className="auth-button signup-button">
          {loading ? "Saving..." : "Save Username"}
        </button>
      </form>
    </div>
  );
};

export default Username;
