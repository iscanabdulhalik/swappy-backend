import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  ParseUUIDPipe,
} from '@nestjs/common';
import { StoriesService } from './stories.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CreateStoryDto, StoryViewDto } from './dto/story.dto';

@Controller()
@UseGuards(FirebaseAuthGuard)
export class StoriesController {
  constructor(private readonly storiesService: StoriesService) {}

  @Post('stories')
  async createStory(
    @CurrentUser('id') userId: string,
    @Body() createStoryDto: CreateStoryDto,
  ) {
    return this.storiesService.createStory(userId, createStoryDto);
  }

  @Get('stories')
  async getStories(@CurrentUser('id') userId: string) {
    return this.storiesService.getStories(userId);
  }

  @Post('stories/:id/view')
  async viewStory(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) storyId: string,
    @Body() viewDto: StoryViewDto,
  ) {
    // Ensure the storyId from the URL matches the one in the DTO
    viewDto.storyId = storyId;
    return this.storiesService.viewStory(userId, viewDto);
  }

  @Get('stories/:id/views')
  async getStoryViews(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) storyId: string,
  ) {
    return this.storiesService.getStoryViews(storyId, userId);
  }
}
