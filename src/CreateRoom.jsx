import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import "./CreateRoom.css";

const CreateRoom = ({ onRoomCreated }) => {
  const [roomName, setRoomName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();

  const generateUniqueCode = async (attempts = 0) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    
    const { data: existing } = await supabase
      .from("rooms")
      .select("id")
      .eq("join_code", code)
      .maybeSingle();

    if (!existing || attempts >= 3) {
      
      return existing ? `${code}-${Date.now().toString(36).slice(-2)}` : code;
    }
    return generateUniqueCode(attempts + 1);
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setErrorMessage("Room name cannot be empty.");
      return;
    }

    setIsCreating(true);
    setErrorMessage("");

    try {
      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("User not authenticated");

      // Generate guaranteed unique code
      const joinCode = await generateUniqueCode();

      // Create room with atomic insertion
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
        // Handle unique constraint violation (should theoretically never happen)
        if (error.code === "23505") {
          const newCode = await generateUniqueCode();
          return handleCreateRoom(); // Retry with new code
        }
        throw error;
      }

      // Success
      onRoomCreated(data.id);
      navigate(`/room/${data.id}`, { 
        state: { joinCode: data.join_code },
        replace: true 
      });

    } catch (error) {
      setErrorMessage(error.message || "Error creating room. Please try again.");
      console.error("Room creation error:", error);
    } finally {
      setIsCreating(false);
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
        maxLength={50}
      />
      <button 
        onClick={handleCreateRoom} 
        className="primary-button"
        disabled={isCreating || !roomName.trim()}
        aria-busy={isCreating}
      >
        {isCreating ? "Creating Room..." : "Create Room"}
      </button>
    </div>
  );
};

export default CreateRoom;