<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia as Assert;
use Tests\TestCase;

class OfficeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // дефолт inertia смотрит в js/Pages (заглавная P) — на Linux
        // проверка существования компонента падает
        config(['inertia.testing.page_paths' => [resource_path('js/pages')]]);
    }

    public function test_guests_are_redirected_to_the_login_page(): void
    {
        $this->get('/office')->assertRedirect('/login');
    }

    public function test_authenticated_users_can_visit_the_office(): void
    {
        $this->actingAs(User::factory()->create());

        $this->get('/office')
            ->assertOk()
            ->assertInertia(fn (Assert $page) => $page->component('office'));
    }
}
