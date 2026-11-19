<?php
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

$host = "localhost";
$user = "root";
$password = "";
$dbname = "voice_recorder_db";

$conn = new mysqli($host, $user, $password, $dbname);
if ($conn->connect_error) {
    die(json_encode(["status" => "error", "message" => "Database connection failed"]));
}

$method = $_SERVER['REQUEST_METHOD'];

if ($method == 'GET') {
    $result = $conn->query("SELECT * FROM recordings ORDER BY id DESC");
    $data = [];
    while ($row = $result->fetch_assoc()) {
        $data[] = $row;
    }
    echo json_encode(["status" => "success", "data" => $data]);
} 
else if ($method == 'POST') {
    $data = json_decode(file_get_contents("php://input"), true);
    $title = $data['title'] ?? 'Voice Note';
    $file_name = $data['file_name'] ?? '';
    $duration = $data['duration'] ?? '0s';
    $file_path = $data['file_path'] ?? '';

    $stmt = $conn->prepare("INSERT INTO recordings (title, file_name, duration, file_path) VALUES (?, ?, ?, ?)");
    $stmt->bind_param("ssss", $title, $file_name, $duration, $file_path);
    if ($stmt->execute()) {
        echo json_encode(["status" => "success", "message" => "Saved successfully"]);
    } else {
        echo json_encode(["status" => "error", "message" => $stmt->error]);
    }
} 
else if ($method == 'PUT') {
    $data = json_decode(file_get_contents("php://input"), true);
    $id = $data['id'] ?? 0;
    $title = $data['title'] ?? '';

    if ($id && $title) {
        $stmt = $conn->prepare("UPDATE recordings SET title = ? WHERE id = ?");
        $stmt->bind_param("si", $title, $id);
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "Updated successfully"]);
        } else {
            echo json_encode(["status" => "error", "message" => $stmt->error]);
        }
    }
} 
else if ($method == 'DELETE') {
    $id = $_GET['id'] ?? 0;
    if ($id) {
        $stmt = $conn->prepare("DELETE FROM recordings WHERE id = ?");
        $stmt->bind_param("i", $id);
        if ($stmt->execute()) {
            echo json_encode(["status" => "success", "message" => "Deleted successfully"]);
        } else {
            echo json_encode(["status" => "error", "message" => $stmt->error]);
        }
    }
}
$conn->close();
?>