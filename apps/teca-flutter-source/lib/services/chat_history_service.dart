import 'package:hive/hive.dart';
import '../models/chat_history.dart';

class ChatHistoryService {
  static Future<void> saveMessage(
    String userId,
    String message,
    bool isUser,
  ) async {
    var box = await Hive.openBox<ChatMessage>('chat_history_$userId');
    box.add(
      ChatMessage(
        userId: userId,
        message: message,
        isUser: isUser,
        timestamp: DateTime.now(),
      ),
    );
  }

  static Future<List<ChatMessage>> getHistory(String userId) async {
    var box = await Hive.openBox<ChatMessage>('chat_history_$userId');
    return box.values.toList();
  }
}
