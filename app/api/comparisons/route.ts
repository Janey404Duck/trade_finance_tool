import { compareScenario } from '@/lib/application/compareScenario';
import { apiError } from '@/lib/api/responses';
import { loadComparisonData } from '@/lib/infrastructure/supabase/loadComparisonData';
import { createClient } from '@/lib/supabase/server';
import { compareScenarioCommandSchema } from '@/lib/validation/comparisonSchemas';

export async function POST(request: Request) {
  try {
    const command = compareScenarioCommandSchema.parse(await request.json());
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return Response.json({ error: 'Authentication required.' }, { status: 401 });
    const data = await loadComparisonData(supabase, command.asOfDate);
    return Response.json(compareScenario(command, data));
  } catch (error) {
    return apiError(error);
  }
}
