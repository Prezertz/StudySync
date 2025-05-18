import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import "./Room.css";
import { FaTrash } from "react-icons/fa";
import { comment } from "postcss";

const isValidUUID = (uuid) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);

const Room = ({ onRoomDeleted }) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [createdBy, setCreatedBy] = useState("");
  const [currentUserId, setCurrentUserId] = useState("");
  const [files, setFiles] = useState([]);
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch room data
  useEffect(() => {
    if (!isValidUUID(id)) return;

    const fetchRoomData = async () => {
      const [{ data: room, error: roomError }, { data: userResult, error: userError }] = await Promise.all([
        supabase.from("rooms").select("name, join_code, created_by").eq("id", id).single(),
        supabase.auth.getUser(),
      ]);

      if (roomError) console.error("Room error:", roomError);
      else {
        setRoomName(room.name);
        setJoinCode(room.join_code);
        setCreatedBy(room.created_by);
      }

      if (userError || !userResult?.user) {
        console.error("User error:", userError);
      } else {
        setCurrentUserId(userResult.user.id);
      }
    };

    fetchRoomData();
  }, [id]);

  // Fetch files
  useEffect(() => {
    if (!isValidUUID(id)) return;

    const fetchFiles = async () => {
      const { data, error } = await supabase
        .from("files")
        .select("file_name, file_url, uploaded_by")
        .eq("room_id", id);

      if (error) console.error("Fetch files error:", error);
      else setFiles(data || []);
    };

    fetchFiles();
  }, [id]);

  // Fetch comments
  useEffect(() => {
    if (!isValidUUID(id)) return;

    const fetchComments = async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("id, user_id, content, created_at, profiles(username)")
        .eq("room_id", id)
        .order("created_at", { ascending: true });

      if (error) console.error("Fetch comments error:", error);
      else setComments(data || []);
    };

    fetchComments();
  }, [id]);

  // File upload handler
  const uploadFiles = useCallback(async (selectedFiles) => {
    if (!isValidUUID(id)) return;

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return;

    for (const file of selectedFiles) {
      const timestamp = Date.now();
      const path = `rooms/${id}/${timestamp}_${file.name}`;

      const { error: uploadError } = await supabase.storage.from("uploads").upload(path, file);
      if (uploadError) {
        console.error("Upload error:", uploadError);
        continue;
      }

      const { data: { publicUrl } } = supabase.storage.from("uploads").getPublicUrl(path);

      const { error: insertError } = await supabase.from("files").insert([
        {
          room_id: id,
          uploaded_by: user.id,
          file_name: file.name,
          file_url: publicUrl,
          file_size: file.size,
        },
      ]);

      if (insertError) console.error("DB insert error:", insertError);
      else setFiles((prev) => [...prev, { file_name: file.name, file_url: publicUrl, uploaded_by: user.id }]);
    }
  }, [id]);

  // Delete file handler
  const deleteFile = async (file) => {
    if (!currentUserId || currentUserId !== file.uploaded_by) return;

    const path = file.file_url.split("/storage/v1/object/public/uploads/")[1];
    if (!path) return;

    const { error: storageError } = await supabase.storage
      .from("uploads")
      .remove([path]);

    if (storageError) {
      console.error("Storage deletion error:", storageError);
      return;
    }

    const { error: dbError } = await supabase
      .from("files")
      .delete()
      .eq("file_url", file.file_url);

    if (dbError) {
      console.error("DB deletion error:", dbError);
      return;
    }

    setFiles((prev) => prev.filter((f) => f.file_url !== file.file_url));
  };

  // Delete room handler
  const handleDeleteRoom = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete this room and all its data?");
    if (!confirmDelete) return;

    setIsDeleting(true);

    try {
      // Fetch all room files first
      const { data: roomFiles, error: fetchFilesError } = await supabase
        .from("files")
        .select("file_url")
        .eq("room_id", id);

      if (fetchFilesError) throw fetchFilesError;

      // Delete files from storage if they exist
      if (roomFiles && roomFiles.length > 0) {
        const filePaths = roomFiles
          .map(f => f.file_url.split("/storage/v1/object/public/uploads/")[1])
          .filter(Boolean);

        if (filePaths.length) {
          const { error: storageDeleteError } = await supabase
            .storage
            .from("uploads")
            .remove(filePaths);

          if (storageDeleteError) throw storageDeleteError;
        }
      }

      // Delete all related data in parallel
      await Promise.all([
        supabase.from("comments").delete().eq("room_id", id),
        supabase.from("files").delete().eq("room_id", id),
        supabase.from("room_members").delete().eq("room_id", id),
      ]);

      // Finally delete the room
      const { error: roomDeleteError } = await supabase
        .from("rooms")
        .delete()
        .eq("id", id)
        .eq("created_by", currentUserId);

      if (roomDeleteError) throw roomDeleteError;

      // Notify parent component about deleted room
      onRoomDeleted(id);

      // Redirect with history replacement
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Error deleting room:", error);
      alert("Failed to delete room. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Drag and drop handlers
  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files);
    uploadFiles(selected);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const dropped = Array.from(e.dataTransfer.files);
    uploadFiles(dropped);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => setDragActive(false);

  // Join code copy handler
  const copyToClipboard = () => {
    navigator.clipboard.writeText(joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  // Comment submission handler
  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return;

    const { data: insertedComment, error: insertError } = await supabase
  .from("comments")
  .insert([
    {
      room_id: id,
      user_id: user.id,
      content: newComment.trim(),
    },
  ])
  .select("id, user_id, content, created_at") // don't need profile here
  .single();

if (insertError) {
  console.error("Comment insert error:", insertError);
} else {
  const { data: userProfile, error: profileError } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .single();

  if (profileError) {
    console.error("Profile fetch error:", profileError);
  }

  setComments((prev) => [
    ...prev,
    {
      ...insertedComment,
      profiles: {
        username: userProfile?.username || "Anonymous",
      },
    },
  ]);

  setNewComment("");
}


      
    
  };
  console.log(comments)

  return (
    <div className="max-w-4xl mx-auto p-6 font-sans text-gray-900">
  <div className="bg-white shadow-xl rounded-2xl p-6 space-y-6">
    <h1 className="text-3xl font-bold text-gray-800">
      {isValidUUID(id) ? roomName : "Invalid Room"}
    </h1>

    {isValidUUID(id) && currentUserId === createdBy && (
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-gray-100 p-4 rounded-lg">
          <p className="text-gray-700">
            <strong>Join Code:</strong>{" "}
            <code className="bg-gray-200 px-2 py-1 rounded text-sm">{joinCode}</code>
          </p>
          <button
            onClick={copyToClipboard}
            className="px-4 py-2 text-sm font-medium text-white bg-black hover:bg-gray-700 rounded-lg transition"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <button
          className="w-full py-2 text-sm font-medium text-white bg-black hover:bg-gray-700 rounded-lg transition"
          onClick={handleDeleteRoom}
          disabled={isDeleting}
        >
          {isDeleting ? "Deleting..." : "🗑 Delete Room"}
        </button>
      </div>
    )}

    {isValidUUID(id) && (
      <>
        {/* Upload Section */}
        <div
          className={`border-2 border-dashed p-6 rounded-xl transition ${
            dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Upload Files</h2>
          <label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center cursor-pointer text-gray-600 hover:text-blue-600"
          >
            <p>
              📁 Drag & drop files here, or{" "}
              <span className="text-blue-600 underline">browse</span>
            </p>
            <input
              id="file-upload"
              type="file"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {/* Uploaded Files Section */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Uploaded Files</h2>
          {files.length === 0 ? (
            <p className="text-gray-500">No files uploaded yet.</p>
          ) : (
            <ul className="space-y-2">
              {files.map((file) => (
                <li
                  key={file.file_url}
                  className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border"
                >
                  <div className="flex items-center gap-2">
                    <span>📄</span>
                    <a
                      href={file.file_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {file.file_name}
                    </a>
                  </div>
                  {file.uploaded_by === currentUserId && (
                    <button
                      onClick={() => deleteFile(file)}
                      className="text-gray-400 hover:text-red-800 border-none"
                      title="Delete file"
                    >
                      <FaTrash />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Comments Section */}
        <div>
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Comments</h2>

          <ul className="space-y-4 mb-4">
            {comments.length === 0 ? (
              <li className="text-gray-500">No comments yet.</li>
            ) : (
              comments.map((comment) => (
                <li key={comment.id} className="bg-gray-50 p-4 rounded-lg border">
                  <p className="text-gray-700 mb-1">{comment.content}</p>
                  <span className="text-sm text-gray-500">
                    <strong>{comment.profiles?.username || "Anonymous"}</strong> ·{" "}
                    {new Date(comment.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}

                  </span>
                </li>
              ))
            )}
          </ul>

          <form onSubmit={handleCommentSubmit} className="space-y-3">
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment..."
              className="w-full p-4 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-300 focus:outline-none bg-white text-gray-800"
              rows="4"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-black text-white rounded-lg hover:bg- gray-900 transition"
            >
              Post Comment
            </button>
          </form>
        </div>
      </>
    )}
  </div>
</div>

  );
};

export default Room;