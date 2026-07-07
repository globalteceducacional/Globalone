class Command {
  final String id;
  String title;
  String prompt;

  Command({required this.id, required this.title, required this.prompt});

  factory Command.fromJson(Map<String, dynamic> json) {
    return Command(
      id: json['id'],
      title: json['title'],
      prompt: json['prompt'],
    );
  }

  Map<String, dynamic> toJson() => {'id': id, 'title': title, 'prompt': prompt};
}
