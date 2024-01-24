'use server';

import { z } from 'zod';
import { sql } from '@vercel/postgres';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { signIn } from '@/auth';
import { AuthError } from 'next-auth';
import bcrypt from 'bcrypt';
import { users } from './placeholder-data';
import { getUser } from '@/app/lib/data';

const FormSchema = z.object({
  id: z.string(),
  customerId: z.string({
    invalid_type_error: 'Please select a customer.',
  }),
  amount: z.coerce
    .number()
    .gt(0, { message: 'Please enter an amount greater that $0.' }),
  status: z.enum(['pending', 'paid'], {
    invalid_type_error: 'Please select an invoice status',
  }),
  date: z.string(),
});

const CreateInvoice = FormSchema.omit({ id: true, date: true });

export type State = {
  errors?: {
    customerId?: string[];
    amount?: string[];
    status?: string[];
  };
  message?: string | null;
};

export async function createInvoice(prevState: State, formData: FormData) {
  const validateFields = CreateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
  if (!validateFields.success) {
    return {
      errors: validateFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Invoice',
    };
  }
  const { customerId, amount, status } = validateFields.data;
  const amountInCents = amount * 100;
  const date = new Date().toISOString().split('T')[0];
  try {
    await sql`
    INSERT INTO invoices (customer_id, amount, status, date)
    VALUES (${customerId}, ${amountInCents}, ${status}, ${date})
  `;
  } catch (error) {
    return {
      error: 'Database Error: Failed to Create Invoice.',
    };
  }
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

const UpdateInvoice = FormSchema.omit({ id: true, date: true });

export async function updateInvoice(
  id: string,
  prevState: State,
  formData: FormData,
) {
  const validateFields = UpdateInvoice.safeParse({
    customerId: formData.get('customerId'),
    amount: formData.get('amount'),
    status: formData.get('status'),
  });
  if (!validateFields.success) {
    return {
      errors: validateFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Invoice',
    };
  }
  const { customerId, amount, status } = validateFields.data;
  const amountInCents = amount * 100;
  try {
    await sql`
    UPDATE invoices
    SET customer_id = ${customerId}, amount = ${amountInCents}, status = ${status}
    WHERE id = ${id}
  `;
  } catch (error) {
    return {
      error: 'Database Error: Failed to Update Invoice.',
    };
  }
  revalidatePath('/dashboard/invoices');
  redirect('/dashboard/invoices');
}

export async function deleteInvoice(id: string) {
  try {
    await sql`DELETE FROM invoices WHERE id = ${id}`;
  } catch (error) {
    return {
      error: 'Database Error: Failed to Delete Invoice.',
    };
  }
  revalidatePath('/dashboard/invoices');
}

export async function authenticate(
  prevState: string | undefined,
  formData: FormData,
) {
  try {
    await signIn('credentials', formData);
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case 'CredentialsSignin':
          return 'Invalid credentials.';
        default:
          return 'Something went wrong.';
      }
    }
    throw error;
  }
}

const UserSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email({ message: 'Invalid email address' }),
  password: z.string().min(6, 'Password must be at least 6 characters long'),
  confirm: z.string(),
});

const CreateUser = UserSchema.omit({ id: true }).refine(
  (data) => data.password === data.confirm,
  {
    message: "Passwords don't match",
    path: ['confirm'],
  },
);

export type UserState = {
  errors?: {
    name?: string[];
    email?: string[];
    password?: string[];
    confirm?: string[];
  };
  message?: string | null;
};

export async function createUser(prevState: UserState, formData: FormData) {
  const validateFields = CreateUser.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    password: formData.get('password'),
    confirm: formData.get('confirm'),
  });
  if (!validateFields.success) {
    return {
      errors: validateFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create User',
    };
  }
  const { name, email, password } = validateFields.data;
  try {
    if (await getUser(email)) {
      return {
        errors: { email: ['Email already in use'] },
      };
    }
  } catch (error) {
    return {
      message: 'Database Error: Failed to Create User',
    };
  }
  const saltRounds = 10;
  const salt = bcrypt.genSaltSync(saltRounds);
  const hashedPassword = bcrypt.hashSync(password, salt);
  try {
    await sql`
    INSERT INTO users (name, email, password)
    VALUES (${name}, ${email}, ${hashedPassword})
  `;
  } catch (error) {
    return {
      message: 'Database Error: Failed to Create User.',
    };
  }
  await signIn('credentials', { email, password });
  return {
    message: null,
    errors: {},
  };
}

const CustomerFormSchema = z.object({
  id: z.string(),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email({ message: 'Invalid email address' }),
  imageUrl: z.string().url({ message: 'Invalid url' }),
});

const CreateCustomer = CustomerFormSchema.omit({ id: true });

export type CustomerState = {
  errors: {
    name?: string[];
    email?: string[];
    imageUrl?: string[];
  };
  message?: string | null;
};

export async function createCustomer(
  prevState: CustomerState,
  formData: FormData,
) {
  const validateFields = CreateCustomer.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    imageUrl: formData.get('imageUrl'),
  });
  if (!validateFields.success) {
    return {
      ...prevState,
      errors: validateFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Create Customer.',
    };
  }
  const { name, email, imageUrl } = validateFields.data;
  try {
    await sql`
      INSERT INTO customers (name, email, image_url) VALUES (${name}, ${email}, ${imageUrl}) ;
    `;
  } catch (error) {
    return {
      ...prevState,
      message: 'Database Error: Failed to Create Customer.',
    };
  }
  revalidatePath('/dashboard/customers');
  redirect('/dashboard/customers');
}

export async function updateCustomer(
  id: string,
  prevState: CustomerState,
  formData: FormData,
) {
  const validateFields = CreateCustomer.safeParse({
    name: formData.get('name'),
    email: formData.get('email'),
    imageUrl: formData.get('imageUrl'),
  });
  if (!validateFields.success) {
    return {
      ...prevState,
      errors: validateFields.error.flatten().fieldErrors,
      message: 'Missing Fields. Failed to Update Customer',
    };
  }
  const { name, email, imageUrl } = validateFields.data;
  try {
    await sql`
    UPDATE customers
    SET name = ${name}, email = ${email}, imageUrl = ${imageUrl}
    WHERE id = ${id}
  `;
  } catch (error) {
    return {
      ...prevState,
      error: 'Database Error: Failed to Update Customer.',
    };
  }
  revalidatePath('/dashboard/customers');
  redirect('/dashboard/customers');
}

export async function deleteCustomer(id: string) {
  try {
    await sql`DELETE FROM customers WHERE id = ${id}`;
  } catch (error) {
    return {
      error: 'Database Error: Failed to Delete Customer.',
    };
  }
  revalidatePath('/dashboard/customers');
}
