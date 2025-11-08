CREATE TABLE IF NOT EXISTS `exam_proctor_windows` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `opens_at` DATETIME NOT NULL,
  `closes_at` DATETIME NOT NULL,
  `timezone` VARCHAR(64) NOT NULL DEFAULT 'Asia/Bangkok',
  `created_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `exam_proctor_windows` (`id`, `opens_at`, `closes_at`, `timezone`)
VALUES (1, '2025-11-09 09:00:00', '2025-11-12 23:59:00', 'Asia/Bangkok')
ON DUPLICATE KEY UPDATE
  `opens_at` = VALUES(`opens_at`),
  `closes_at` = VALUES(`closes_at`),
  `timezone` = VALUES(`timezone`);

