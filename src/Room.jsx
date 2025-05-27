import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import "./Room.css";
import { FaTrash } from "react-icons/fa";

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
  const [uploadCategory, setUploadCategory] = useState("assignment");

  useEffect(() => {
    if (!isValidUUID(id)) return;

    const fetchRoomData = async () => {
      const [{ data: room, error: roomError }, { data: userResult, error: userError }] =
        await Promise.all([
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

  useEffect(() => {
    if (!isValidUUID(id)) return;

    const fetchFiles = async () => {
      const { data, error } = await supabase
        .from("files")
        .select("file_name, file_url, uploaded_by, category")
        .eq("room_id", id);

      if (error) console.error("Fetch files error:", error);
      else setFiles(data || []);
    };

    fetchFiles();
  }, [id]);

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

  const uploadFiles = useCallback(
    async (selectedFiles) => {
      if (!isValidUUID(id)) return;

      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) return;
for (const file of selectedFiles) {
  if (file.size > 10 * 1024 * 1024) {
    alert(`File "${file.name}" exceeds the 10MB limit and was not uploaded.`);
    continue;
  }

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
            category: uploadCategory,
          },
        ]);

        if (insertError) console.error("DB insert error:", insertError);
        else setFiles((prev) => [
          ...prev,
          {
            file_name: file.name,
            file_url: publicUrl,
            uploaded_by: user.id,
            category: uploadCategory,
          },
        ]);
      }
    },
    [id, uploadCategory]
  );

  const deleteFile = async (file) => {
    if (!currentUserId || currentUserId !== file.uploaded_by) return;

    const path = file.file_url.split("/storage/v1/object/public/uploads/")[1];
    if (!path) return;

    const { error: storageError } = await supabase.storage.from("uploads").remove([path]);
    if (storageError) return console.error("Storage deletion error:", storageError);

    const { error: dbError } = await supabase.from("files").delete().eq("file_url", file.file_url);
    if (dbError) return console.error("DB deletion error:", dbError);

    setFiles((prev) => prev.filter((f) => f.file_url !== file.file_url));
  };

  const handleDeleteRoom = async () => {
    if (!window.confirm("Are you sure you want to delete this room and all its data?")) return;
    setIsDeleting(true);

    try {
      const { data: roomFiles, error: fetchFilesError } = await supabase
        .from("files")
        .select("file_url")
        .eq("room_id", id);

      if (fetchFilesError) throw fetchFilesError;

      const filePaths = roomFiles
        .map((f) => f.file_url.split("/storage/v1/object/public/uploads/")[1])
        .filter(Boolean);

      if (filePaths.length) {
        const { error: storageDeleteError } = await supabase.storage
          .from("uploads")
          .remove(filePaths);
        if (storageDeleteError) throw storageDeleteError;
      }

      await Promise.all([
        supabase.from("comments").delete().eq("room_id", id),
        supabase.from("files").delete().eq("room_id", id),
        supabase.from("room_members").delete().eq("room_id", id),
      ]);

      const { error: roomDeleteError } = await supabase
        .from("rooms")
        .delete()
        .eq("id", id)
        .eq("created_by", currentUserId);

      if (roomDeleteError) throw roomDeleteError;

      onRoomDeleted(id);
      navigate("/dashboard", { replace: true });
    } catch (error) {
      console.error("Error deleting room:", error);
      alert("Failed to delete room. Please try again.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleFileChange = (e) => uploadFiles(Array.from(e.target.files));
  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    uploadFiles(Array.from(e.dataTransfer.files));
  };
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };
  const handleDragLeave = () => setDragActive(false);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(joinCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  const handleCommentSubmit = async (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;

    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return;

    const { data: insertedComment, error: insertError } = await supabase
      .from("comments")
      .insert([{ room_id: id, user_id: user.id, content: newComment.trim() }])
      .select("id, user_id, content, created_at")
      .single();

    if (insertError) return console.error("Comment insert error:", insertError);

    const { data: userProfile, error: profileError } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", user.id)
      .single();

    if (profileError) console.error("Profile fetch error:", profileError);

    setComments((prev) => [
      ...prev,
      {
        ...insertedComment,
        profiles: { username: userProfile?.username || "Anonymous" },
      },
    ]);

    setNewComment("");
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-10 font-sans text-gray-900">
  <div className="bg-white shadow-xl rounded-2xl p-6 md:p-10 space-y-10 border border-gray-100">

    <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">
      {isValidUUID(id) ? roomName : "Invalid Room"}
    </h1>

    {isValidUUID(id) && currentUserId === createdBy && (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-gray-50 border border-gray-200 p-4 rounded-lg">
          <p className="text-gray-700 text-sm">
            <strong>Join Code:</strong>{" "}
            <code className="bg-gray-100 px-2 py-1 rounded text-sm font-mono">{joinCode}</code>
          </p>
          <button
            onClick={copyToClipboard}
            className="mt-2 sm:mt-0 px-4 py-2 text-sm bg-black text-white rounded hover:bg-gray-800 transition"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <button
          onClick={handleDeleteRoom}
          disabled={isDeleting}
          className="w-full py-2 text-sm bg-red-600 hover:bg-red-700 text-white rounded transition"
        >
          {isDeleting ? "Deleting..." : "🗑 Delete Room"}
        </button>
      </div>
    )}

    {isValidUUID(id) && (
      <>
        {/* Upload Section */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={`border-2 border-dashed rounded-xl text-center p-6 transition ${
            dragActive ? "border-blue-500 bg-blue-50" : "border-gray-300"
          }`}
        >
          <h2 className="text-lg font-medium text-gray-800 mb-3">Upload Files</h2>

          <div className="text-left mb-4">
            <label className="block text-sm text-gray-600 mb-1">Select Category:</label>
            <select
              value={uploadCategory}
              onChange={(e) => setUploadCategory(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-gray-800 bg-white"
            >
              <option value="assignment">Assignment</option>
              <option value="notes">Notes & Resources</option>
            </select>
          </div>

          <label htmlFor="file-upload" className="cursor-pointer text-sm text-gray-600 hover:text-blue-600">
            📁 Drag & drop files, or <span className="text-blue-600 underline">browse</span>
            <input id="file-upload" type="file" multiple onChange={handleFileChange} className="hidden" />
          </label>
        </div>

        {/* Uploaded Files */}
        <div>
          <h2 className="text-lg font-medium text-gray-800 mb-4">Uploaded Files</h2>
          {files.length === 0 ? (
            <p className="text-sm text-gray-500">No files uploaded yet.</p>
          ) : (
            ["assignment", "notes"].map((categoryKey) => {
              const label =
                categoryKey === "assignment" ? "Assignments" : "Notes & Resources";
              const filtered = files.filter((f) => f.category === categoryKey);

              return (
                <div key={categoryKey} className="mb-6">
                  <h3 className="text-sm font-semibold text-gray-600 mb-2">{label}</h3>
                  {filtered.length === 0 ? (
                    <p className="text-sm text-gray-400">No {label.toLowerCase()} uploaded.</p>
                  ) : (
                    <ul className="space-y-2">
                      {filtered.map((file) => (
                        <li
                          key={file.file_url}
                          className="flex items-center justify-between bg-gray-50 p-3 rounded-lg border"
                        >
                          <div className="flex items-center gap-2 text-sm">
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
                              className="text-gray-400 hover:text-red-600 transition"
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
              );
            })
          )}
        </div>

        {/* Comments */}
        <div>
          <h2 className="text-lg font-medium text-gray-800 mb-4">Comments</h2>
          <ul className="space-y-4 mb-4">
            {comments.length === 0 ? (
              <li className="text-sm text-gray-500">No comments yet.</li>
            ) : (
              comments.map((comment) => (
                <li key={comment.id} className="bg-gray-50 p-4 rounded-lg border">
                  <p className="text-sm text-gray-700 mb-1">{comment.content}</p>
                  <span className="text-xs text-gray-500">
                    <strong>{comment.profiles?.username || "Anonymous"}</strong> ·{" "}
                    {new Date(comment.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
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
              rows="4"
              className="w-full p-3 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-300 focus:outline-none bg-white text-sm text-gray-800"
            />
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-black text-white rounded hover:bg-gray-900 transition"
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
