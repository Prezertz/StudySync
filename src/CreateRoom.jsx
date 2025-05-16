import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import "./CreateRoom.css"; // Import the CSS file

const CreateRoom = () => {
  const [roomName, setRoomName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [joinCode, setJoinCode] = useState(null);
  const [roomId, setRoomId] = useState(null); // NEW: track actual room ID
  const navigate = useNavigate();

  const generateJoinCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setErrorMessage("Room name cannot be empty.");
      return;
    }

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("User not authenticated.");
      return;
    }

    const joinCode = generateJoinCode();

    const { data, error } = await supabase
      .from("rooms")
      .insert([{ name: roomName, created_by: user.id, join_code: joinCode }])
      .select("id, join_code")
      .single();

    if (error) {
      setErrorMessage("Error creating room. Try a different name.");
      console.error("Error:", error);
    } else {
      setJoinCode(data.join_code);
      setRoomId(data.id); // Save the UUID to redirect properly
    }
  };

  const handleContinue = () => {
    if (!roomId) {
      setErrorMessage("Missing room ID.");
      return;
    }
    navigate(`/room/${roomId}`); // Redirect to /room/:id
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(joinCode);
    alert("Join code copied to clipboard!");
  };

  return (
    <div className="create-room-container">
      <h2 className="create-room-title">Create a Room</h2>
      {errorMessage && <p className="error-message">{errorMessage}</p>}

      {!joinCode ? (
        <>
          <input
            type="text"
            placeholder="Enter Room Name"
            value={roomName}
            onChange={(e) => setRoomName(e.target.value)}
            className="create-room-input"
          />
          <button onClick={handleCreateRoom} className="primary-button">
            Create Room
          </button>
        </>
      ) : (
        <div className="room-success">
          <p className="room-success-message">Room created successfully!</p>
          <p className="mb-4">
            <strong>Join Code:</strong>{" "}
            <code className="join-code">{joinCode}</code>
          </p>
          <button onClick={copyToClipboard} className="secondary-button">
            Copy Code
          </button>
          <br />
          <button onClick={handleContinue} className="primary-button">
            Continue to Room
          </button>
        </div>
      )}
    </div>
  );
};

export default CreateRoom;
