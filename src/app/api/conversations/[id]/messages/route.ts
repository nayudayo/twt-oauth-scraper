import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '../../../../../lib/auth/config';
import { initDB } from '../../../../../lib/db';
import { ConversationError } from '../../../../../lib/db/conversation';
import type { MessageResponse, MessageListResponse } from '../../../../../types/conversation';

// ... rest of the code ...