import { NextResponse } from 'next/server';
import { createAdminClient } from '@/utils/supabase/server';
import { filterRouteLocations, sampleRouteWaypoints, validateMatchedRoute } from '@/utils/vehicleLocation.mjs';

export async function GET(_request, { params }) {
    const tripId = params.id;
    const supabase = await createAdminClient();

    try {
        const { data: rawLocations, error } = await supabase
            .from('vehicle_locations')
            .select('*')
            .eq('trip_id', tripId)
            .order('recorded_at', { ascending: true });

        if (error) throw error;

        const locations = filterRouteLocations(rawLocations || []);
        if (locations.length < 2) {
            return NextResponse.json({
                locations,
                matchedPath: locations,
                source: 'filtered',
                reason: 'not_enough_points',
            });
        }

        const clientId = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
        const clientSecret = process.env.NAVER_MAP_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
            return NextResponse.json({
                locations,
                matchedPath: locations,
                source: 'filtered',
                reason: 'naver_credentials_missing',
            });
        }

        const { clean, waypoints } = sampleRouteWaypoints(locations, 12);
        const start = clean[0];
        const goal = clean[clean.length - 1];
        const naverParams = new URLSearchParams({
            start: `${start.lng},${start.lat}`,
            goal: `${goal.lng},${goal.lat}`,
            option: 'trafast',
            cartype: '6',
            fueltype: 'diesel',
        });
        if (waypoints.length > 0) {
            naverParams.set('waypoints', waypoints.map((p) => `${p.lng},${p.lat}`).join('|'));
        }

        const apiUrl = `https://maps.apigw.ntruss.com/map-direction-15/v1/driving?${naverParams.toString()}`;
        const apiRes = await fetch(apiUrl, {
            headers: {
                'X-NCP-APIGW-API-KEY-ID': clientId,
                'X-NCP-APIGW-API-KEY': clientSecret,
            },
            signal: AbortSignal.timeout(7000),
        });
        const data = await apiRes.json();
        const route = data?.route?.trafast?.[0] || Object.values(data?.route || {})?.[0]?.[0];
        const path = Array.isArray(route?.path)
            ? route.path.map(([lng, lat]) => ({ lat, lng }))
            : [];

        if (!apiRes.ok || data.code !== 0 || path.length < 2) {
            return NextResponse.json({
                locations,
                matchedPath: locations,
                source: 'filtered',
                reason: 'naver_route_failed',
                naverStatus: apiRes.status,
                naverCode: data?.code,
            });
        }

        const routeDecision = validateMatchedRoute(clean, path, {
            summaryDistanceM: route.summary?.distance,
        });
        if (!routeDecision.ok) {
            return NextResponse.json({
                locations: clean,
                matchedPath: clean,
                source: 'filtered',
                reason: routeDecision.reason,
                rejectedMatchedRoute: routeDecision,
            });
        }

        return NextResponse.json({
            locations,
            matchedPath: path,
            source: 'naver-directions15',
            summary: route.summary || null,
            sampledWaypoints: waypoints.length,
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
