import 'package:flutter/material.dart';
import 'dart:developer' as developer;
import '../services/auth_service.dart';
import 'home_page.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();

  bool _isLoading = false;
  bool _showPassword = false;
  String _statusMessage = '';
  bool _showStatusMessage = false;

  // Variáveis para a função escondida
  int _tecaClickCount = 0;
  bool _showSecretMessage = false;
  DateTime? _lastClickTime;

  @override
  void initState() {
    super.initState();
    developer.log('🚀 LoginPage inicializada', name: 'LoginPage');
    _checkAutoLogin();
  }

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _checkAutoLogin() async {
    final isLoggedIn = await AuthService.isLoggedIn();
    if (isLoggedIn) {
      developer.log(
        '✅ Usuário já logado, redirecionando...',
        name: 'LoginPage',
      );
      _navigateToHome();
    }
  }

  void _showStatus(String message, bool isError) {
    if (!mounted) return;
    setState(() {
      _statusMessage = message;
      _showStatusMessage = true;
    });

    if (!isError) {
      Future.delayed(const Duration(seconds: 2), () {
        if (mounted) {
          setState(() {
            _showStatusMessage = false;
          });
        }
      });
    }
  }

  // Função escondida para acessar como administrador
  void _handleTecaClick() {
    final now = DateTime.now();

    // Resetar contador se passou muito tempo desde o último clique
    if (_lastClickTime != null &&
        now.difference(_lastClickTime!).inSeconds > 3) {
      _tecaClickCount = 0;
    }

    _lastClickTime = now;
    _tecaClickCount++;

    developer.log(
      '🔐 Clique secreto no Teca: $_tecaClickCount/5',
      name: 'LoginPage',
    );

    // Mostrar feedback visual discreto
    if (mounted) {
      setState(() {
        _showSecretMessage = true;
      });
    }

    // Esconder mensagem após 1 segundo
    Future.delayed(const Duration(seconds: 1), () {
      if (mounted) {
        setState(() {
          _showSecretMessage = false;
        });
      }
    });

    // Se chegou a 5 cliques, ativar modo administrador
    if (_tecaClickCount >= 5) {
      developer.log('🎯 Modo administrador ativado!', name: 'LoginPage');
      _activateAdminMode();
      _tecaClickCount = 0; // Resetar contador
    }
  }

  // Ativar modo administrador
  Future<void> _activateAdminMode() async {
    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _showStatusMessage = false;
    });

    try {
      // Simular login como administrador
      developer.log('🔑 Ativando modo administrador...', name: 'LoginPage');

      // Usar o método do AuthService para ativar modo administrador
      await AuthService.activateAdminMode();

      _showStatus('Modo administrador ativado!', false);

      // Aguardar um pouco para mostrar a mensagem
      if (mounted) {
        await Future.delayed(const Duration(seconds: 1));
        if (mounted) {
          _navigateToHome();
        }
      }
    } catch (e) {
      developer.log(
        '💥 Erro ao ativar modo administrador: $e',
        name: 'LoginPage',
      );
      _showStatus('Erro ao ativar modo administrador: $e', true);
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  Future<void> _handleLogin() async {
    if (!_formKey.currentState!.validate()) return;

    if (!mounted) return;
    setState(() {
      _isLoading = true;
      _showStatusMessage = false;
    });

    developer.log(
      '🔐 Iniciando processo de login na interface',
      name: 'LoginPage',
    );
    developer.log(
      '📧 Email fornecido: ${_emailController.text}',
      name: 'LoginPage',
    );
    developer.log(
      '🔑 Senha fornecida: ${_passwordController.text.isNotEmpty ? "Presente" : "Ausente"}',
      name: 'LoginPage',
    );

    try {
      developer.log('🔄 Chamando AuthService.login...', name: 'LoginPage');
      final result = await AuthService.login(
        _emailController.text.trim(),
        _passwordController.text,
      );

      developer.log(
        '📋 Resultado do login: ${result['success']}',
        name: 'LoginPage',
      );

      if (result['success']) {
        developer.log('✅ Login bem-sucedido!', name: 'LoginPage');
        _showStatus('Login realizado com sucesso!', false);
        _navigateToHome();
      } else {
        developer.log('❌ Login falhou: ${result['error']}', name: 'LoginPage');
        _showStatus(result['error'] ?? 'Erro no login', true);
      }
    } catch (e) {
      developer.log('💥 Erro durante login: $e', name: 'LoginPage');
      _showStatus('Erro inesperado: $e', true);
    } finally {
      if (mounted) {
        setState(() {
          _isLoading = false;
        });
      }
    }
  }

  void _navigateToHome() {
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (context) => const HomePage()),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: const Color(0xFF0B2233),
      appBar: AppBar(
        title: const Text(
          'Teca - Login',
          style: TextStyle(color: Colors.cyanAccent),
        ),
        backgroundColor: const Color(0xFF112B3C),
        elevation: 0,
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24.0),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              // Logo ou título
              const Icon(Icons.school, size: 80, color: Colors.cyanAccent),
              const SizedBox(height: 16),

              // Título clicável com função escondida
              GestureDetector(
                onTap: _handleTecaClick,
                child: AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  padding: const EdgeInsets.symmetric(
                    horizontal: 8,
                    vertical: 4,
                  ),
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(8),
                    color:
                        _showSecretMessage
                            ? Colors.cyanAccent.withAlpha(30)
                            : Colors.transparent,
                  ),
                  child: Text(
                    'Bem-vindo(a) a Teca',
                    style: TextStyle(
                      fontSize: 28,
                      fontWeight: FontWeight.bold,
                      color:
                          _showSecretMessage
                              ? Colors.cyanAccent
                              : Colors.cyanAccent,
                    ),
                  ),
                ),
              ),

              // Mensagem secreta discreta
              if (_showSecretMessage)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Clique ${5 - _tecaClickCount} vezes mais...',
                    style: TextStyle(
                      fontSize: 12,
                      color: Colors.cyanAccent.withAlpha(150),
                      fontStyle: FontStyle.italic,
                    ),
                  ),
                ),

              const SizedBox(height: 32),

              // Formulário
              Container(
                padding: const EdgeInsets.all(24),
                decoration: BoxDecoration(
                  color: const Color(0xFF112B3C),
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: Colors.cyanAccent.withAlpha(100)),
                ),
                child: Form(
                  key: _formKey,
                  child: Column(
                    children: [
                      TextFormField(
                        controller: _emailController,
                        style: const TextStyle(color: Colors.white),
                        decoration: const InputDecoration(
                          labelText: 'Email',
                          labelStyle: TextStyle(color: Colors.cyanAccent),
                          border: OutlineInputBorder(),
                          enabledBorder: OutlineInputBorder(
                            borderSide: BorderSide(color: Colors.cyanAccent),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderSide: BorderSide(
                              color: Colors.cyanAccent,
                              width: 2,
                            ),
                          ),
                        ),
                        keyboardType: TextInputType.emailAddress,
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'Por favor, insira seu email';
                          }
                          if (!RegExp(
                            r'^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$',
                          ).hasMatch(value)) {
                            return 'Por favor, insira um email válido';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _passwordController,
                        style: const TextStyle(color: Colors.white),
                        obscureText: !_showPassword,
                        decoration: InputDecoration(
                          labelText: 'Senha',
                          labelStyle: const TextStyle(color: Colors.cyanAccent),
                          border: const OutlineInputBorder(),
                          enabledBorder: const OutlineInputBorder(
                            borderSide: BorderSide(color: Colors.cyanAccent),
                          ),
                          focusedBorder: const OutlineInputBorder(
                            borderSide: BorderSide(
                              color: Colors.cyanAccent,
                              width: 2,
                            ),
                          ),
                          suffixIcon: IconButton(
                            icon: Icon(
                              _showPassword
                                  ? Icons.visibility
                                  : Icons.visibility_off,
                              color: Colors.cyanAccent,
                            ),
                            onPressed: () {
                              setState(() {
                                _showPassword = !_showPassword;
                              });
                            },
                          ),
                        ),
                        validator: (value) {
                          if (value == null || value.isEmpty) {
                            return 'Por favor, insira sua senha';
                          }
                          if (value.length < 6) {
                            return 'A senha deve ter pelo menos 6 caracteres';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),

                      // Mensagem de status
                      if (_showStatusMessage)
                        Container(
                          padding: const EdgeInsets.all(12),
                          decoration: BoxDecoration(
                            color:
                                _statusMessage.contains('sucesso')
                                    ? Colors.green.withAlpha(50)
                                    : Colors.red.withAlpha(50),
                            borderRadius: BorderRadius.circular(8),
                            border: Border.all(
                              color:
                                  _statusMessage.contains('sucesso')
                                      ? Colors.green
                                      : Colors.red,
                            ),
                          ),
                          child: Row(
                            children: [
                              Icon(
                                _statusMessage.contains('sucesso')
                                    ? Icons.check_circle
                                    : Icons.error,
                                color:
                                    _statusMessage.contains('sucesso')
                                        ? Colors.green
                                        : Colors.red,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  _statusMessage,
                                  style: TextStyle(
                                    color:
                                        _statusMessage.contains('sucesso')
                                            ? Colors.green[300]
                                            : Colors.red[300],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),

                      if (_showStatusMessage) const SizedBox(height: 16),

                      SizedBox(
                        width: double.infinity,
                        height: 50,
                        child: ElevatedButton(
                          onPressed: _isLoading ? null : _handleLogin,
                          style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.cyanAccent,
                            foregroundColor: Colors.black,
                            shape: RoundedRectangleBorder(
                              borderRadius: BorderRadius.circular(8),
                            ),
                          ),
                          child:
                              _isLoading
                                  ? const CircularProgressIndicator(
                                    color: Colors.black,
                                  )
                                  : const Text('Entrar'),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
