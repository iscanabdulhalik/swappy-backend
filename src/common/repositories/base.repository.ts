import { Logger } from '@nestjs/common';
import { PrismaService } from 'prisma/prisma.service';
import { AppException } from '../exceptions/app-exceptions';

export abstract class BaseRepository<T> {
  protected readonly prisma: PrismaService;
  protected readonly logger: Logger;
  protected readonly entityName: string;

  constructor(prisma: PrismaService, entityName: string) {
    this.prisma = prisma;
    this.entityName = entityName;
    this.logger = new Logger(`${entityName}Repository`);
  }

  /**
   * Find a record by ID
   *
   * @param id - Record ID
   * @param includeRelations - Relations to include
   * @returns Found record or null
   */
  async findById(
    id: string,
    includeRelations: Record<string, any> = {},
  ): Promise<T | null> {
    try {
      const record = await (this.prisma as any)[
        this.entityName.toLowerCase()
      ].findUnique({
        where: { id },
        include: includeRelations,
      });

      return record;
    } catch (error) {
      this.logger.error(
        `Error finding ${this.entityName} by ID: ${error.message}`,
        error.stack,
      );

      // Prisma-specific error handling
      if (error.code === 'P2023') {
        throw AppException.badRequest('bad_request', 'Invalid ID format');
      }

      throw AppException.internal(`Error retrieving ${this.entityName}`);
    }
  }

  /**
   * Find a record by ID or throw an exception if not found
   *
   * @param id - Record ID
   * @param includeRelations - Relations to include
   * @returns Found record
   * @throws AppException if record not found
   */
  async findByIdOrThrow(
    id: string,
    includeRelations: Record<string, any> = {},
  ): Promise<T> {
    const record = await this.findById(id, includeRelations);

    if (!record) {
      throw AppException.notFound(`not_found`, `${this.entityName} not found`);
    }

    return record;
  }

  /**
   * Create a new record
   *
   * @param data - Data to create the record with
   * @returns Created record
   */
  async create(data: any): Promise<T> {
    try {
      return await (this.prisma as any)[this.entityName.toLowerCase()].create({
        data,
      });
    } catch (error) {
      this.logger.error(
        `Error creating ${this.entityName}: ${error.message}`,
        error.stack,
      );

      // Prisma-specific error handling
      if (error.code === 'P2002') {
        throw AppException.conflict(
          'conflict',
          `${this.entityName} with this ${error.meta?.target?.join(', ')} already exists`,
        );
      }

      if (error.code === 'P2003') {
        throw AppException.badRequest(
          'bad_request',
          `Related ${error.meta?.field_name} not found`,
        );
      }

      throw AppException.internal(`Error creating ${this.entityName}`);
    }
  }

  /**
   * Update a record
   *
   * @param id - Record ID
   * @param data - Data to update
   * @returns Updated record
   */
  async update(id: string, data: any): Promise<T> {
    try {
      return await (this.prisma as any)[this.entityName.toLowerCase()].update({
        where: { id },
        data,
      });
    } catch (error) {
      this.logger.error(
        `Error updating ${this.entityName}: ${error.message}`,
        error.stack,
      );

      // Prisma-specific error handling
      if (error.code === 'P2025') {
        throw AppException.notFound(
          `not_found`,
          `${this.entityName} not found`,
        );
      }

      if (error.code === 'P2002') {
        throw AppException.conflict(
          'conflict',
          `${this.entityName} with this ${error.meta?.target?.join(', ')} already exists`,
        );
      }

      throw AppException.internal(`Error updating ${this.entityName}`);
    }
  }

  /**
   * Delete a record
   *
   * @param id - Record ID
   * @returns Deleted record
   */
  async delete(id: string): Promise<T> {
    try {
      return await (this.prisma as any)[this.entityName.toLowerCase()].delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error(
        `Error deleting ${this.entityName}: ${error.message}`,
        error.stack,
      );

      // Prisma-specific error handling
      if (error.code === 'P2025') {
        throw AppException.notFound(
          `not_found`,
          `${this.entityName} not found`,
        );
      }

      throw AppException.internal(`Error deleting ${this.entityName}`);
    }
  }

  /**
   * Find records with pagination
   *
   * @param filter - Filter criteria
   * @param page - Page number (starts from 1)
   * @param pageSize - Number of items per page
   * @param orderBy - Order criteria
   * @param include - Relations to include
   * @returns Records and pagination info
   */
  async findWithPagination(
    filter: Record<string, any> = {},
    page: number = 1,
    pageSize: number = 20,
    orderBy: Record<string, any> = { createdAt: 'desc' },
    include: Record<string, any> = {},
  ): Promise<{
    data: T[];
    total: number;
    page: number;
    pageSize: number;
    pageCount: number;
  }> {
    try {
      const skip = (page - 1) * pageSize;
      const take = pageSize;

      const [records, total] = await Promise.all([
        (this.prisma as any)[this.entityName.toLowerCase()].findMany({
          where: filter,
          skip,
          take,
          orderBy,
          include,
        }),
        (this.prisma as any)[this.entityName.toLowerCase()].count({
          where: filter,
        }),
      ]);

      const pageCount = Math.ceil(total / pageSize);

      return {
        data: records,
        total,
        page,
        pageSize,
        pageCount,
      };
    } catch (error) {
      this.logger.error(
        `Error finding ${this.entityName} with pagination: ${error.message}`,
        error.stack,
      );
      throw AppException.internal(`Error retrieving ${this.entityName} list`);
    }
  }
}
