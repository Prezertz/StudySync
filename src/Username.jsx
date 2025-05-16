import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import "./Username.css";

const Username = () => {
  const [username, setUsername] = useState("");
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (!user || authError) {
      setError("User not found. Please log in.");
      return;
    }

    const { error: insertError } = await supabase
      .from("profiles")
      .insert([{ id: user.id, username }], { onConflict: ['id'] });

    if (insertError) {
      setError(insertError.message);
    } else {
      navigate("/dashboard");
    }
  };

  return (
    <div className="username-container">
      <h2 className="username-title">Set Your Username</h2>
      {error && <p className="username-error">{error}</p>}
      <form onSubmit={handleSubmit} className="username-form">
        <input
          type="text"
          placeholder="Enter Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="username-input"
          required
        />
        <button type="submit" className="username-button">
          Save Username
        </button>
      </form>
    </div>
  );
};

export default Username;
