import 'package:hive/hive.dart';

part 'chat_history.g.dart';

@HiveType(typeId: 0)
class ChatMessage extends HiveObject {
  @HiveField(0)
  String userId;

  @HiveField(1)
  String message;

  @HiveField(2)
  bool isUser;

  @HiveField(3)
  DateTime timestamp;

  ChatMessage({
    required this.userId,
    required this.message,
    required this.isUser,
    required this.timestamp,
  });
}
