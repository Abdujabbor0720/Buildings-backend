import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer } from '../../database/entities/customer.entity';
import {
  PaginatedResult,
  type PaginationDto,
} from '../../common/dto/pagination.dto';

/** Faqat tahrirlanadigan maydonlar — bog‘lanishlar bu yo‘l orqali yozilmaydi. */
export type CustomerInput = Partial<
  Pick<
    Customer,
    'name' | 'type' | 'inn' | 'head' | 'phone' | 'address' | 'isActive'
  >
>;

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customers: Repository<Customer>,
  ) {}

  async list(query: PaginationDto): Promise<PaginatedResult<Customer>> {
    const qb = this.customers
      .createQueryBuilder('c')
      .loadRelationCountAndMap('c.objectCount', 'c.objects');

    if (query.search) {
      qb.andWhere('(c.name ILIKE :s OR c.head ILIKE :s OR c.inn ILIKE :s)', {
        s: `%${query.search}%`,
      });
    }

    const [items, total] = await qb
      .orderBy('c.name', 'ASC')
      .skip(query.skip)
      .take(query.limit)
      .getManyAndCount();

    return new PaginatedResult(items, total, query.page, query.limit);
  }

  async findOne(id: string): Promise<Customer> {
    const customer = await this.customers.findOne({ where: { id } });
    if (!customer) throw new NotFoundException('Buyurtmachi topilmadi');
    return customer;
  }

  create(dto: CustomerInput): Promise<Customer> {
    return this.customers.save(this.customers.create(dto));
  }

  async update(id: string, dto: CustomerInput): Promise<Customer> {
    await this.findOne(id);
    await this.customers.update(id, dto);
    return this.findOne(id);
  }
}
