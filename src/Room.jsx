import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "./supabase";
import "./Room.css";

const isValidUUID = (uuid) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uuid);

const Room = () => {
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

  useEffect(() => {
    if (!isValidUUID(id)) return;

    const fetchFiles = async () => {
      const { data, error } = await supabase
        .from("files")
        .select("file_name, file_url, uploaded_by")
        .eq("room_id", id);

      if (error) console.error("Fetch files error:", error);
      else setFiles(data);
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
      else setComments(data);
    };

    fetchComments();
  }, [id]);

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

  const handleDeleteRoom = async () => {
    const confirmDelete = window.confirm("Are you sure you want to delete this room and all its data?");
    if (!confirmDelete) return;

    const { data: roomFiles, error: fetchFilesError } = await supabase
      .from("files")
      .select("file_url")
      .eq("room_id", id);

      

    if (fetchFilesError) {
      console.error("Error fetching room files:", fetchFilesError);
      return;
    }

    const filePaths = roomFiles.map(f =>
      f.file_url.split("/storage/v1/object/public/uploads/")[1]
    ).filter(Boolean);

    if (filePaths.length) {
      const { error: storageDeleteError } = await supabase
        .storage
        .from("uploads")
        .remove(filePaths);

      if (storageDeleteError) {
        console.error("Error deleting files from storage:", storageDeleteError);
        return;
      }
    }

    const { error: commentsDeleteError } = await supabase
      .from("comments")
      .delete()
      .eq("room_id", id);

    if (commentsDeleteError) {
      console.error("Error deleting comments:", commentsDeleteError);
      return;
    }

    const { error: filesDeleteError } = await supabase
      .from("files")
      .delete()
      .eq("room_id", id);

    if (filesDeleteError) {
      console.error("Error deleting files from DB:", filesDeleteError);
      return;
    }

    const { error: roomDeleteError } = await supabase
      .from("rooms")
      .delete()
      .eq("id", id)
      .eq("created_by", currentUserId);

    if (roomDeleteError) {
      console.error("Error deleting room:", roomDeleteError);
      return;
    }

    alert("Room deleted successfully.");
    navigate("/dashboard");
  };

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

    const { data, error: insertError } = await supabase
      .from("comments")
      .insert([
        {
          room_id: id,
          user_id: user.id,
          content: newComment.trim(),
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error("Comment insert error:", insertError);
    } else {
      setComments((prev) => [...prev, data]);
      setNewComment("");
    }
  };

  return (
    <div className="room-container">
      <div className="room-inner">
        <h1 className="room-title">{isValidUUID(id) ? roomName : "Invalid Room"}</h1>

        {isValidUUID(id) && currentUserId === createdBy && (
          <div className="creator-actions">
            <div className="join-code-container">
              <p className="join-code-text">
                <strong>Join Code:</strong> <code>{joinCode}</code>
              </p>
              <button className="copy-button" onClick={copyToClipboard}>
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
            <button className="delete-room-button" onClick={handleDeleteRoom}>
              🗑 Delete Room
            </button>
          </div>
        )}

        {isValidUUID(id) && (
          <>
            <div
              className={`upload-section ${dragActive ? "drag-active" : ""}`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
            >
              <h2 className="section-title">Upload Files</h2>
              <label htmlFor="file-upload" className="file-drop-zone">
                <p>
                  📁 Drag & drop files here, or <span className="browse-text">browse</span>
                </p>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  onChange={handleFileChange}
                  className="file-input"
                />
              </label>
            </div>

            <div className="files-section">
              <h2 className="section-title">Uploaded Files</h2>
              {files.length === 0 ? (
                <p className="no-files">No files uploaded yet.</p>
              ) : (
                <ul className="files-list">
                  {files.map((file) => (
                    <li key={file.file_url} className="file-item">
                      <span className="file-icon">📄</span>
                      <a
                        href={file.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="file-link"
                      >
                        {file.file_name}
                      </a>
                      {file.uploaded_by === currentUserId && (
                        <button
                          onClick={() => deleteFile(file)}
                          className="delete-button"
                          title="Delete file"
                        >
                          🗑
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="comments-section">
              <h2 className="section-title">Comments</h2>

              <ul className="comments-list">
                {comments.length === 0 ? (
                  <li className="no-comments">No comments yet.</li>
                ) : (
                  comments.map((comment) => (
                    <li key={comment.id} className="comment-item">
                      <p className="comment-content">{comment.content}</p>
                      <span className="comment-meta">
                        <strong>{comment.profiles?.username || "Anonymous"}</strong> ·{" "}
                        {new Date(comment.created_at).toLocaleString()}
                      </span>
                    </li>
                  ))
                )}
              </ul>

              <form onSubmit={handleCommentSubmit} className="comment-form">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Write a comment..."
                  className="comment-input"
                  rows="3"
                />
                <button type="submit" className="comment-button">Post Comment</button>
              </form>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Room;
