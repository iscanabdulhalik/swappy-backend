import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { PostsService } from './posts.service';
import { FirebaseAuthGuard } from '../../common/guards/firebase-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  CreatePostDto,
  UpdatePostDto,
  CreatePostMediaDto,
  CreateCommentDto,
  UpdateCommentDto,
  FeedQueryDto,
} from './dto/post.dto';

@Controller()
@UseGuards(FirebaseAuthGuard)
export class PostsController {
  constructor(private readonly postsService: PostsService) {}

  @Get('feed')
  async getFeed(
    @CurrentUser('id') userId: string,
    @Query() queryDto: FeedQueryDto,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.postsService.getFeed(userId, queryDto, limit, offset);
  }

  @Post('posts')
  async createPost(
    @CurrentUser('id') userId: string,
    @Body() createPostDto: CreatePostDto,
  ) {
    return this.postsService.createPost(userId, createPostDto);
  }

  @Post('posts/media')
  async addPostMedia(
    @CurrentUser('id') userId: string,
    @Body('postId', ParseUUIDPipe) postId: string,
    @Body() mediaDto: CreatePostMediaDto,
  ) {
    return this.postsService.addPostMedia(postId, userId, mediaDto);
  }

  @Get('posts/:id')
  async getPostById(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) postId: string,
  ) {
    return this.postsService.getPostById(postId, userId);
  }

  @Put('posts/:id')
  async updatePost(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) postId: string,
    @Body() updatePostDto: UpdatePostDto,
  ) {
    return this.postsService.updatePost(postId, userId, updatePostDto);
  }

  @Delete('posts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deletePost(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) postId: string,
  ) {
    return this.postsService.deletePost(postId, userId);
  }

  @Put('posts/:id/like')
  async toggleLikePost(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) postId: string,
  ) {
    return this.postsService.toggleLikePost(postId, userId);
  }

  @Get('posts/:id/comments')
  async getPostComments(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) postId: string,
    @Query('limit') limit = 20,
    @Query('offset') offset = 0,
  ) {
    return this.postsService.getPostComments(postId, userId, limit, offset);
  }

  @Post('posts/:id/comments')
  async addComment(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) postId: string,
    @Body() createCommentDto: CreateCommentDto,
  ) {
    return this.postsService.addComment(postId, userId, createCommentDto);
  }

  @Put('comments/:id')
  async updateComment(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) commentId: string,
    @Body() updateCommentDto: UpdateCommentDto,
  ) {
    return this.postsService.updateComment(commentId, userId, updateCommentDto);
  }

  @Delete('comments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteComment(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) commentId: string,
  ) {
    return this.postsService.deleteComment(commentId, userId);
  }

  @Put('comments/:id/like')
  async toggleLikeComment(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) commentId: string,
  ) {
    return this.postsService.toggleLikeComment(commentId, userId);
  }
}
