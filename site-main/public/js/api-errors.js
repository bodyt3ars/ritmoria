(() => {
  const ERROR_MESSAGES = {
    LIMIT_FILE_SIZE: "Файл слишком большой. Попробуй выбрать файл поменьше.",
    LIMIT_UNEXPECTED_FILE: "Не удалось обработать выбранный файл. Попробуй загрузить его заново.",
    invalid_conversation_avatar: "Для аватарки группы подходит только изображение.",
    conversation_title_required: "Введи название группы.",
    conversation_create_failed: "Не удалось создать группу. Попробуй ещё раз.",
    conversation_update_failed: "Не удалось сохранить изменения группы.",
    conversation_delete_failed: "Не удалось удалить группу.",
    conversation_leave_failed: "Не удалось выйти из группы.",
    conversation_not_found: "Этот чат не найден или уже был удалён.",
    conversation_owner_cannot_leave: "Владелец группы не может выйти, пока не удалит группу.",
    conversation_media_list_failed: "Не удалось загрузить медиа этой группы.",
    conversation_members_failed: "Не удалось загрузить список участников.",
    invalid_media_type: "Неизвестный тип медиа.",
    invalid_email: "Укажи корректную почту.",
    email_already_used: "Эта почта уже занята.",
    email_not_verified: "Сначала подтверди почту кодом из письма.",
    verification_code_not_found: "Сначала запроси новый код подтверждения.",
    verification_code_expired: "Код подтверждения истёк. Запроси новый.",
    registration_failed: "Не удалось завершить регистрацию.",
    password_too_short: "Пароль должен быть минимум 8 символов.",
    username_too_short: "Имя должно быть минимум 3 символа.",
    message_send_failed: "Не удалось отправить сообщение. Попробуй ещё раз.",
    message_text_required: "Напиши сообщение или прикрепи файл.",
    target_messages_disabled: "Этот пользователь отключил входящие сообщения.",
    blocked_by_target: "Этот пользователь ограничил тебе сообщения.",
    messages_blocked_for_target: "Ты отключил сообщения для этого пользователя.",
    message_start_failed: "Не удалось открыть диалог.",
    open_title_required: "Добавь название опена.",
    open_create_failed: "Не удалось опубликовать опен.",
    open_apply_failed: "Не удалось отправить заявку.",
    open_select_failed: "Не удалось выбрать участника.",
    open_delete_failed: "Не удалось удалить опен.",
    open_application_exists: "Ты уже отправил заявку в этот опен.",
    open_not_found: "Опен не найден.",
    invalid_data: "Некорректные данные. Проверь заполненные поля.",
    server_error: "Что-то пошло не так на сервере. Попробуй ещё раз чуть позже.",
    "server error": "Что-то пошло не так на сервере. Попробуй ещё раз чуть позже.",
    update_failed: "Не удалось сохранить изменения.",
    track_create_failed: "Не удалось отправить трек.",
    track_upload_failed: "Не удалось загрузить трек. Проверь файл и попробуй ещё раз.",
    avatar_upload_failed: "Не удалось загрузить изображение. Проверь файл и попробуй ещё раз.",
    post_media_upload_failed: "Не удалось загрузить медиафайл. Проверь файл и попробуй ещё раз.",
    "Avatar upload failed": "Не удалось загрузить аватар.",
    "No file uploaded": "Сначала выбери файл.",
    "Wrong password": "Неверный пароль.",
    "Wrong code": "Неверный код. Проверь письмо и попробуй ещё раз.",
    "No token": "Нужно войти в аккаунт.",
    "Invalid token": "Сессия устарела. Войди в аккаунт заново.",
    "Нет токена": "Нужно войти в аккаунт.",
    "Неверный токен": "Сессия устарела. Войди в аккаунт заново.",
    no_token: "Нужно войти в аккаунт.",
    invalid_token: "Сессия устарела. Войди в аккаунт заново.",
    unauthorized: "Нужно войти в аккаунт.",
    user_not_found: "Пользователь не найден.",
    track_not_found: "Трек не найден.",
    post_not_found: "Публикация не найдена.",
    comment_not_found: "Комментарий не найден.",
    delete_account_code_send_failed: "Не удалось отправить код подтверждения.",
    delete_account_failed: "Не удалось удалить аккаунт."
  };

  function humanizeErrorCode(code, fallback = "Что-то пошло не так. Попробуй ещё раз.") {
    const raw = String(code || "").trim();
    if (!raw) return fallback;

    if (ERROR_MESSAGES[raw]) {
      return ERROR_MESSAGES[raw];
    }

    const lower = raw.toLowerCase();
    if (ERROR_MESSAGES[lower]) {
      return ERROR_MESSAGES[lower];
    }

    if (/json|invalid input syntax|malformed/i.test(raw)) {
      return "Один из параметров передан в неверном формате. Обнови страницу и попробуй ещё раз.";
    }

    if (/too large|file is too large|limit_file_size/i.test(raw)) {
      return "Файл слишком большой. Попробуй выбрать файл поменьше.";
    }

    if (/token|jwt/i.test(raw)) {
      return "Сессия устарела. Войди в аккаунт заново.";
    }

    if (/[_-]/.test(raw) || /^[A-Za-z]/.test(raw)) {
      return fallback;
    }

    return raw;
  }

  window.getApiErrorMessage = function getApiErrorMessage(payload, fallback = "Что-то пошло не так. Попробуй ещё раз.") {
    if (typeof payload === "string") {
      return humanizeErrorCode(payload, fallback);
    }

    const message = String(payload?.message || "").trim();
    if (message) {
      return message;
    }

    const error = String(payload?.error || payload?.errorCode || payload?.code || "").trim();
    return humanizeErrorCode(error, fallback);
  };
})();
