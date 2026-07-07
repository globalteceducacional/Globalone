class ApiChat {
  final String id;
  final String title;
  final DateTime createdAt;
  final List<ApiChatParticipant> participants;
  final List<ApiMessage> messages;

  ApiChat({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.participants,
    required this.messages,
  });

  factory ApiChat.fromJson(Map<String, dynamic> json) {
    return ApiChat(
      id: json['id'],
      title: json['title'],
      createdAt: DateTime.parse(json['created_at']),
      participants:
          (json['participants'] as List<dynamic>)
              .map((p) => ApiChatParticipant.fromJson(p))
              .toList(),
      messages:
          (json['messages'] as List<dynamic>)
              .map((m) => ApiMessage.fromJson(m))
              .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'title': title,
      'created_at': createdAt.toIso8601String(),
      'participants': participants.map((p) => p.toJson()).toList(),
      'messages': messages.map((m) => m.toJson()).toList(),
    };
  }
}

class ApiChatParticipant {
  final String id;
  final String chatId;
  final String userId;
  final ApiUser user;

  ApiChatParticipant({
    required this.id,
    required this.chatId,
    required this.userId,
    required this.user,
  });

  factory ApiChatParticipant.fromJson(Map<String, dynamic> json) {
    return ApiChatParticipant(
      id: json['id'],
      chatId: json['chat_id'],
      userId: json['user_id'],
      user: ApiUser.fromJson(json['user']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'chat_id': chatId,
      'user_id': userId,
      'user': user.toJson(),
    };
  }
}

class ApiUser {
  final String id;
  final String email;
  final String role;
  final ApiStudent? student;
  final ApiTeacher? teacher;

  ApiUser({
    required this.id,
    required this.email,
    required this.role,
    this.student,
    this.teacher,
  });

  factory ApiUser.fromJson(Map<String, dynamic> json) {
    return ApiUser(
      id: json['id'],
      email: json['email'],
      role: json['role'],
      student:
          json['student'] != null ? ApiStudent.fromJson(json['student']) : null,
      teacher:
          json['teacher'] != null ? ApiTeacher.fromJson(json['teacher']) : null,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'email': email,
      'role': role,
      'student': student?.toJson(),
      'teacher': teacher?.toJson(),
    };
  }

  String get displayName {
    if (student != null) return student!.name;
    if (teacher != null) return teacher!.name;
    return email;
  }
}

class ApiStudent {
  final String id;
  final String name;
  final String email;
  final String? registrationNumber;
  final String? profilePicture;

  ApiStudent({
    required this.id,
    required this.name,
    required this.email,
    this.registrationNumber,
    this.profilePicture,
  });

  factory ApiStudent.fromJson(Map<String, dynamic> json) {
    return ApiStudent(
      id: json['id'],
      name: json['name'],
      email: json['email'],
      registrationNumber: json['registrationNumber'],
      profilePicture: json['profilePicture'],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'name': name,
      'email': email,
      'registrationNumber': registrationNumber,
      'profilePicture': profilePicture,
    };
  }
}

class ApiTeacher {
  final String id;
  final String name;
  final String email;

  ApiTeacher({required this.id, required this.name, required this.email});

  factory ApiTeacher.fromJson(Map<String, dynamic> json) {
    return ApiTeacher(id: json['id'], name: json['name'], email: json['email']);
  }

  Map<String, dynamic> toJson() {
    return {'id': id, 'name': name, 'email': email};
  }
}

class ApiMessage {
  final String id;
  final String chatId;
  final String userId;
  final String content;
  final DateTime createdAt;
  final ApiUser user;
  final List<ApiFile> files;

  ApiMessage({
    required this.id,
    required this.chatId,
    required this.userId,
    required this.content,
    required this.createdAt,
    required this.user,
    required this.files,
  });

  factory ApiMessage.fromJson(Map<String, dynamic> json) {
    return ApiMessage(
      id: json['id'],
      chatId: json['chat_id'],
      userId: json['user_id'],
      content: json['content'],
      createdAt: DateTime.parse(json['created_at']),
      user: ApiUser.fromJson(json['user']),
      files:
          (json['files'] as List<dynamic>)
              .map((f) => ApiFile.fromJson(f))
              .toList(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'chat_id': chatId,
      'user_id': userId,
      'content': content,
      'created_at': createdAt.toIso8601String(),
      'user': user.toJson(),
      'files': files.map((f) => f.toJson()).toList(),
    };
  }
}

class ApiFile {
  final String id;
  final String messageId;
  final String filePath;
  final String fileName;
  final String fileType;
  final DateTime uploadedAt;

  ApiFile({
    required this.id,
    required this.messageId,
    required this.filePath,
    required this.fileName,
    required this.fileType,
    required this.uploadedAt,
  });

  factory ApiFile.fromJson(Map<String, dynamic> json) {
    return ApiFile(
      id: json['id'],
      messageId: json['message_id'],
      filePath: json['file_path'],
      fileName: json['file_name'],
      fileType: json['file_type'],
      uploadedAt: DateTime.parse(json['uploaded_at']),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'message_id': messageId,
      'file_path': filePath,
      'file_name': fileName,
      'file_type': fileType,
      'uploaded_at': uploadedAt.toIso8601String(),
    };
  }

  bool get isImage {
    return fileType.startsWith('image/');
  }

  bool get isDocument {
    return fileType.startsWith('application/') || fileType == 'text/plain';
  }
}
