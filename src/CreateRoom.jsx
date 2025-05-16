import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import "./CreateRoom.css";

const CreateRoom = ({ onRoomCreated }) => {
  const [roomName, setRoomName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const generateJoinCode = () => {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setErrorMessage("Room name cannot be empty.");
      return;
    }

    setIsCreating(true);
    setErrorMessage("");

    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user) {
      setErrorMessage("User not authenticated.");
      setIsCreating(false);
      return;
    }

    const joinCode = generateJoinCode();

    const { data, error } = await supabase
      .from("rooms")
      .insert([{ 
        name: roomName, 
        created_by: user.id, 
        join_code: joinCode 
      }])
      .select("id, join_code")
      .single();

    if (error) {
      setErrorMessage("Error creating room. Try a different name.");
      console.error("Error:", error);
      setIsCreating(false);
    } else {
      onRoomCreated(data.id); // Register room for back-button prevention
      navigate(`/room/${data.id}`, { 
        state: { joinCode: data.join_code },
        replace: true 
      });
    }
  };

  return (
    <div className="create-room-container">
      <h2 className="create-room-title">Create a Room</h2>
      {errorMessage && <p className="error-message">{errorMessage}</p>}

      <input
        type="text"
        placeholder="Enter Room Name"
        value={roomName}
        onChange={(e) => setRoomName(e.target.value)}
        className="create-room-input"
        disabled={isCreating}
      />
      <button 
        onClick={handleCreateRoom} 
        className="primary-button"
        disabled={isCreating}
      >
        {isCreating ? "Creating Room..." : "Create Room"}
      </button>
    </div>
  );
};

export default CreateRoom;