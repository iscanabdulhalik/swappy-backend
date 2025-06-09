import { IsBoolean, IsObject, IsOptional } from 'class-validator';
import { NotificationType } from 'src/common/enums/app.enum';

export class UpdateNotificationSettingsDto {
  @IsBoolean()
  @IsOptional()
  emailEnabled?: boolean;

  @IsBoolean()
  @IsOptional()
  pushEnabled?: boolean;

  @IsObject()
  @IsOptional()
  preferences?: {
    [key in NotificationType]?: {
      email?: boolean;
      push?: boolean;
    };
  };
}
